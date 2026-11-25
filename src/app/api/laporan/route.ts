import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { hasPermission } from '@/lib/auth'
import {
  addDaysStr,
  computeDailyMetrics,
  computePeriodMetrics,
  countRecurringOverlapDays,
  DailyMetrics,
  getDayBounds,
  getMonthBounds,
  getTodayWIB,
  isValidDateStr,
  isValidMonthStr,
} from '@/lib/daily-metrics'

async function getFlashForDate(
  dateStr: string
): Promise<DailyMetrics & { isClosed: boolean }> {
  const { dayStart } = getDayBounds(dateStr)
  const closed = await prisma.dailyClose.findUnique({
    where: { tanggalBisnis: dayStart },
  })

  if (closed && closed.status === 'CLOSED') {
    const totalPendapatan = Math.round(
      closed.pendapatanKamar + closed.pendapatanLain
    )
    return {
      tanggal: dateStr,
      kamarTersedia: closed.kamarTersedia,
      kamarTerjual: closed.kamarTerjual,
      okupansi: closed.okupansi,
      adr: closed.adr,
      revpar: closed.revpar,
      pendapatanKamar: closed.pendapatanKamar,
      pendapatanLain: closed.pendapatanLain,
      totalPendapatan,
      totalPajak: closed.totalPajak,
      totalServiceCharge: closed.totalServiceCharge,
      biayaOperasional: closed.biayaOperasional,
      biayaAlokasi: closed.biayaAlokasi,
      komisiOta: closed.komisiOta,
      totalBiaya: closed.totalBiaya,
      labaOperasional: closed.labaOperasional,
      labaKas: closed.labaKas,
      uangMasuk: closed.uangMasuk,
      uangKeluar: closed.uangKeluar,
      posisiKas: closed.posisiKas,
      isClosed: true,
    }
  }

  const live = await computeDailyMetrics(dateStr)
  return { ...live, isClosed: false }
}

function stripProfitFields<T extends object>(
  obj: T,
  canViewProfit: boolean
): Partial<T> {
  if (canViewProfit) return obj
  const copy = { ...obj } as Record<string, unknown>
  delete copy.labaOperasional
  delete copy.labaKas
  delete copy.gop
  delete copy.labaBersihOperasional
  delete copy.labaDepartemen
  return copy as Partial<T>
}

export async function GET(request: NextRequest) {
  const { user, error } = await authorizeApi('laporan.read')
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const canViewProfit = hasPermission(user.role, 'laporan.laba')
    const type = searchParams.get('type')

    if (type === 'profit' && !canViewProfit) {
      return NextResponse.json(
        { error: 'Akses ditolak. Peran Anda tidak memiliki izin melihat laporan laba.' },
        { status: 403 }
      )
    }

    const tanggal = (searchParams.get('tanggal') || getTodayWIB()).slice(0, 10)
    if (!isValidDateStr(tanggal)) {
      return NextResponse.json(
        { error: 'Format tanggal tidak valid (gunakan YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const bulan = (searchParams.get('bulan') || tanggal.slice(0, 7)).slice(0, 7)
    if (!isValidMonthStr(bulan)) {
      return NextResponse.json(
        { error: 'Format bulan tidak valid (gunakan YYYY-MM)' },
        { status: 400 }
      )
    }

    const yesterdayStr = addDaysStr(tanggal, -1)
    const { startStr: monthStartStr, endStr: monthEndStr } = getMonthBounds(bulan)

    // Untuk MTD & YTD: jika tanggal berada di bulan yang dipilih, cap sampai tanggal tersebut;
    // jika melihat bulan lain (mis. bulan lalu), hitung seluruh bulan tsb.
    const periodEndStr = tanggal.startsWith(bulan) ? tanggal : monthEndStr
    const yearStartStr = `${bulan.slice(0, 4)}-01-01`

    const { dayStart: monthStart } = getDayBounds(monthStartStr)
    const { dayEnd: monthEnd } = getDayBounds(monthEndStr)

    const [
      dailyFlash,
      yesterdayFlash,
      mtd,
      ytd,
      monthlyCharges,
      monthlyExpenses,
      monthlyRecurring,
    ] = await Promise.all([
      getFlashForDate(tanggal),
      getFlashForDate(yesterdayStr),
      computePeriodMetrics(monthStartStr, periodEndStr),
      computePeriodMetrics(yearStartStr, periodEndStr),
      prisma.folioCharge.findMany({
        where: {
          isVoid: false,
          tanggal: { gte: monthStart, lte: monthEnd },
        },
        select: {
          kategori: true,
          nominal: true,
          pajak: true,
          serviceCharge: true,
          total: true,
        },
      }),
      prisma.expense.findMany({
        where: {
          statusApproval: 'APPROVED',
          tanggal: { gte: monthStart, lte: monthEnd },
        },
        include: {
          category: {
            select: {
              id: true,
              nama: true,
              departemen: true,
              kodeUsali: true,
            },
          },
        },
      }),
      prisma.recurringExpense.findMany({
        where: {
          aktif: true,
          periodeAwal: { lte: monthEnd },
          periodeAkhir: { gte: monthStart },
        },
        include: {
          category: {
            select: {
              id: true,
              nama: true,
              departemen: true,
              kodeUsali: true,
            },
          },
        },
      }),
    ])

    // Revenue by category
    const revMap = new Map<
      string,
      { kategori: string; nominal: number; pajak: number; serviceCharge: number; total: number; count: number }
    >()

    let revKamar = 0
    let revFnb = 0
    let revLainNonFnb = 0

    for (const c of monthlyCharges) {
      const existing = revMap.get(c.kategori) || {
        kategori: c.kategori,
        nominal: 0,
        pajak: 0,
        serviceCharge: 0,
        total: 0,
        count: 0,
      }
      existing.nominal += c.nominal
      existing.pajak += c.pajak
      existing.serviceCharge += c.serviceCharge
      existing.total += c.total
      existing.count += 1
      revMap.set(c.kategori, existing)

      if (c.kategori === 'KAMAR') {
        revKamar += c.nominal
      } else if (c.kategori === 'MAKAN' || c.kategori === 'MINIBAR' || c.kategori === 'FNB') {
        revFnb += c.nominal
      } else {
        revLainNonFnb += c.nominal
      }
    }

    const revenueByCategory = Array.from(revMap.values())
      .map((item) => ({
        ...item,
        nominal: Math.round(item.nominal),
        pajak: Math.round(item.pajak),
        serviceCharge: Math.round(item.serviceCharge),
        total: Math.round(item.total),
      }))
      .sort((a, b) => b.nominal - a.nominal)

    // Expense by category & USALI departemen
    const expCatMap = new Map<
      string,
      {
        categoryId: string
        nama: string
        departemen: string
        kodeUsali: string | null
        realisasi: number
        alokasi: number
        total: number
        count: number
      }
    >()

    const usaliExpenses: Record<string, number> = {
      KAMAR: 0,
      FNB: 0,
      TAK_TERDISTRIBUSI: 0,
      TETAP: 0,
    }

    for (const exp of monthlyExpenses) {
      const dept = exp.departemen || exp.category.departemen
      if (exp.jenisBeban === 'OPERASIONAL') {
        usaliExpenses[dept] = (usaliExpenses[dept] ?? 0) + exp.nominal
      }

      const existing = expCatMap.get(exp.categoryId) || {
        categoryId: exp.categoryId,
        nama: exp.category.nama,
        departemen: exp.category.departemen,
        kodeUsali: exp.category.kodeUsali,
        realisasi: 0,
        alokasi: 0,
        total: 0,
        count: 0,
      }
      existing.realisasi += exp.nominal
      existing.total += exp.nominal
      existing.count += 1
      expCatMap.set(exp.categoryId, existing)
    }

    for (const rec of monthlyRecurring) {
      const overlapDays = countRecurringOverlapDays(
        rec.periodeAwal,
        rec.periodeAkhir,
        monthStartStr,
        monthEndStr
      )
      if (overlapDays <= 0) continue

      const allocatedAmount = Math.round(rec.alokasiHarian * overlapDays)
      const dept = rec.category.departemen
      usaliExpenses[dept] = (usaliExpenses[dept] ?? 0) + allocatedAmount

      const existing = expCatMap.get(rec.categoryId) || {
        categoryId: rec.categoryId,
        nama: rec.category.nama,
        departemen: rec.category.departemen,
        kodeUsali: rec.category.kodeUsali,
        realisasi: 0,
        alokasi: 0,
        total: 0,
        count: 0,
      }
      existing.alokasi += allocatedAmount
      existing.total += allocatedAmount
      expCatMap.set(rec.categoryId, existing)
    }

    const expenseByCategory = Array.from(expCatMap.values())
      .map((item) => ({
        ...item,
        realisasi: Math.round(item.realisasi),
        alokasi: Math.round(item.alokasi),
        total: Math.round(item.total),
      }))
      .sort((a, b) => b.total - a.total)

    const totalPendapatanBulanan = Math.round(revKamar + revFnb + revLainNonFnb)
    const biayaKamar = Math.round(usaliExpenses.KAMAR ?? 0)
    const biayaFnb = Math.round(usaliExpenses.FNB ?? 0)
    const biayaDepartemen = Math.round(biayaKamar + biayaFnb)
    const biayaTakTerdistribusi = Math.round(usaliExpenses.TAK_TERDISTRIBUSI ?? 0)
    const biayaTetap = Math.round(usaliExpenses.TETAP ?? 0)
    const gop = Math.round(
      totalPendapatanBulanan - biayaDepartemen - biayaTakTerdistribusi
    )
    const labaBersihOperasional = Math.round(gop - biayaTetap)

    const usaliDepartemen = {
      KAMAR: stripProfitFields(
        {
          pendapatan: Math.round(revKamar),
          biaya: biayaKamar,
          labaDepartemen: Math.round(revKamar - biayaKamar),
        },
        canViewProfit
      ),
      FNB: stripProfitFields(
        {
          pendapatan: Math.round(revFnb),
          biaya: biayaFnb,
          labaDepartemen: Math.round(revFnb - biayaFnb),
        },
        canViewProfit
      ),
      LAINNYA: {
        pendapatan: Math.round(revLainNonFnb),
        biaya: 0,
      },
      TAK_TERDISTRIBUSI: {
        pendapatan: 0,
        biaya: biayaTakTerdistribusi,
      },
      TETAP: {
        pendapatan: 0,
        biaya: biayaTetap,
      },
    }

    const usaliMonthlyBase: Record<string, unknown> = {
      bulan,
      totalPendapatan: totalPendapatanBulanan,
      biayaDepartemen,
      biayaTakTerdistribusi,
      biayaTetap,
      totalBiaya: Math.round(biayaDepartemen + biayaTakTerdistribusi + biayaTetap),
      departemen: usaliDepartemen,
    }

    if (canViewProfit) {
      usaliMonthlyBase.gop = gop
      usaliMonthlyBase.labaBersihOperasional = labaBersihOperasional
    }

    return NextResponse.json({
      tanggal,
      bulan,
      canViewProfit,
      dailyFlash: stripProfitFields(dailyFlash, canViewProfit),
      yesterdayFlash: stripProfitFields(yesterdayFlash, canViewProfit),
      mtd: stripProfitFields(mtd, canViewProfit),
      ytd: stripProfitFields(ytd, canViewProfit),
      usaliMonthly: usaliMonthlyBase,
      expenseByCategory,
      revenueByCategory,
    })
  } catch (err) {
    return handleApiError(err, 'GET /api/laporan')
  }
}
