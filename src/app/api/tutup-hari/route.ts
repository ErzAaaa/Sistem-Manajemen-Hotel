import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { calculateTaxAndService } from '@/lib/calculations'
import {
  computeDailyMetrics,
  getDayBounds,
  getTodayWIB,
  isValidDateStr,
} from '@/lib/daily-metrics'

const USER_PUBLIC_SELECT = {
  id: true,
  nama: true,
  username: true,
  role: true,
}

export async function GET(request: NextRequest) {
  const { error } = await authorizeApi('tutup-hari.read')
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const tanggal = (searchParams.get('tanggal') || getTodayWIB()).slice(0, 10)

    if (!isValidDateStr(tanggal)) {
      return NextResponse.json(
        { error: 'Format tanggal tidak valid (gunakan YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const { dayStart, dayEnd } = getDayBounds(tanggal)

    const [history, existingClose, previewMetrics, pendingCheckOuts] =
      await Promise.all([
        prisma.dailyClose.findMany({
          orderBy: { tanggalBisnis: 'desc' },
          take: 30,
          include: {
            closedBy: { select: USER_PUBLIC_SELECT },
          },
        }),
        prisma.dailyClose.findUnique({
          where: { tanggalBisnis: dayStart },
          include: {
            closedBy: { select: USER_PUBLIC_SELECT },
          },
        }),
        computeDailyMetrics(tanggal),
        prisma.reservation.findMany({
          where: {
            status: 'CHECKED_IN',
            tanggalCheckOut: { lte: dayEnd },
          },
          include: {
            guest: { select: { id: true, nama: true, telepon: true } },
            room: { select: { id: true, nomor: true } },
            folio: {
              select: {
                id: true,
                nomorFolio: true,
                totalCharge: true,
                totalPayment: true,
                balance: true,
              },
            },
          },
          orderBy: { tanggalCheckOut: 'asc' },
        }),
      ])

    return NextResponse.json({
      tanggal,
      history,
      preview: {
        ...previewMetrics,
        status: existingClose?.status ?? 'OPEN',
        dailyClose: existingClose ?? null,
      },
      pendingCheckOuts,
    })
  } catch (err) {
    return handleApiError(err, 'GET /api/tutup-hari')
  }
}

export async function POST(request: NextRequest) {
  const { user, error } = await authorizeApi('tutup-hari.write')
  if (error) return error

  try {
    const body = await request.json()
    const action = typeof body.action === 'string' ? body.action : 'CLOSE'
    const tanggal = (
      typeof body.tanggal === 'string' && body.tanggal.trim()
        ? body.tanggal.trim()
        : getTodayWIB()
    ).slice(0, 10)

    if (!isValidDateStr(tanggal)) {
      return NextResponse.json(
        { error: 'Format tanggal tidak valid (gunakan YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const { dayStart, dayEnd } = getDayBounds(tanggal)

    if (action === 'REOPEN') {
      const reopenAuth = await authorizeApi('tutup-hari.reopen')
      if (reopenAuth.error) return reopenAuth.error

      const alasan = typeof body.alasan === 'string' ? body.alasan.trim() : ''
      if (!alasan) {
        return NextResponse.json(
          { error: 'Alasan buka kembali hari bisnis wajib diisi' },
          { status: 400 }
        )
      }

      const existing = await prisma.dailyClose.findUnique({
        where: { tanggalBisnis: dayStart },
      })

      if (!existing || existing.status !== 'CLOSED') {
        return NextResponse.json(
          { error: `Hari bisnis tanggal ${tanggal} belum ditutup` },
          { status: 400 }
        )
      }

      const updated = await prisma.dailyClose.update({
        where: { id: existing.id },
        data: {
          status: 'OPEN',
          reopenAlasan: alasan,
          reopenAt: new Date(),
        },
        include: {
          closedBy: { select: USER_PUBLIC_SELECT },
        },
      })

      await createAuditLog({
        userId: reopenAuth.user.id,
        aksi: 'REOPEN_DAY',
        entitas: 'DailyClose',
        entitasId: updated.id,
        dataBefore: { status: existing.status },
        dataAfter: { status: updated.status, reopenAlasan: alasan },
        keterangan: `Buka kembali hari bisnis ${tanggal}: ${alasan}`,
      })

      return NextResponse.json({ dailyClose: updated })
    }

    // Close Day
    const existing = await prisma.dailyClose.findUnique({
      where: { tanggalBisnis: dayStart },
    })

    if (existing?.status === 'CLOSED') {
      return NextResponse.json(
        {
          error: `Hari bisnis tanggal ${tanggal} sudah ditutup. Buka kembali terlebih dahulu jika ingin menutup ulang.`,
        },
        { status: 400 }
      )
    }

    const postRoomCharges = body.postRoomCharges !== false
    let postedChargesCount = 0

    if (postRoomCharges) {
      const [taxConfig, checkedInReservations] = await Promise.all([
        prisma.taxConfig.findFirst({
          where: { aktif: true },
          orderBy: { berlakuSejak: 'desc' },
        }),
        prisma.reservation.findMany({
          where: {
            status: 'CHECKED_IN',
            tanggalCheckIn: { lte: dayEnd },
            tanggalCheckOut: { gt: dayEnd },
          },
          include: {
            room: { select: { nomor: true } },
            folio: {
              include: {
                charges: {
                  where: {
                    kategori: 'KAMAR',
                    isVoid: false,
                    tanggal: { gte: dayStart, lte: dayEnd },
                  },
                  select: { id: true },
                },
              },
            },
          },
        }),
      ])

      const pajakDaerahPct = taxConfig?.pajakDaerahPct ?? 10
      const serviceChargePct = taxConfig?.serviceChargePct ?? 10
      const modeHarga =
        taxConfig?.modeHarga === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE'

      await prisma.$transaction(async (tx) => {
        for (const res of checkedInReservations) {
          if (res.folio && res.folio.charges.length > 0) {
            continue
          }

          let folio = res.folio
          if (!folio) {
            const createdFolio = await tx.folio.create({
              data: {
                reservationId: res.id,
                status: 'OPEN',
              },
            })
            folio = { ...createdFolio, charges: [] }
          }

          const taxResult = calculateTaxAndService({
            baseAmount: res.tarifPerMalam,
            pajakDaerahPct,
            serviceChargePct,
            modeHarga,
          })

          await tx.folioCharge.create({
            data: {
              folioId: folio.id,
              tanggal: dayStart,
              kategori: 'KAMAR',
              deskripsi: `Biaya Kamar ${res.room?.nomor ?? '-'} (${tanggal})`,
              nominal: taxResult.subtotal,
              pajak: taxResult.pajak,
              serviceCharge: taxResult.serviceCharge,
              total: taxResult.total,
              createdById: user.id,
            },
          })

          const [chargeAgg, paymentAgg] = await Promise.all([
            tx.folioCharge.aggregate({
              where: { folioId: folio.id, isVoid: false },
              _sum: { total: true },
            }),
            tx.payment.aggregate({
              where: { folioId: folio.id, isVoid: false },
              _sum: { nominal: true },
            }),
          ])

          const totalCharge = Math.round(chargeAgg._sum.total ?? 0)
          const totalPayment = Math.round(paymentAgg._sum.nominal ?? 0)

          await tx.folio.update({
            where: { id: folio.id },
            data: {
              totalCharge,
              totalPayment,
              balance: Math.round(totalCharge - totalPayment),
            },
          })

          postedChargesCount++
        }
      })
    }

    const metrics = await computeDailyMetrics(tanggal)
    const closedAt = new Date()

    const dailyClose = await prisma.dailyClose.upsert({
      where: { tanggalBisnis: dayStart },
      create: {
        tanggalBisnis: dayStart,
        status: 'CLOSED',
        kamarTersedia: metrics.kamarTersedia,
        kamarTerjual: metrics.kamarTerjual,
        okupansi: metrics.okupansi,
        adr: metrics.adr,
        revpar: metrics.revpar,
        pendapatanKamar: metrics.pendapatanKamar,
        pendapatanLain: metrics.pendapatanLain,
        totalPajak: metrics.totalPajak,
        totalServiceCharge: metrics.totalServiceCharge,
        totalBiaya: metrics.totalBiaya,
        biayaOperasional: metrics.biayaOperasional,
        biayaAlokasi: metrics.biayaAlokasi,
        komisiOta: metrics.komisiOta,
        labaOperasional: metrics.labaOperasional,
        labaKas: metrics.labaKas,
        uangMasuk: metrics.uangMasuk,
        uangKeluar: metrics.uangKeluar,
        posisiKas: metrics.posisiKas,
        closedById: user.id,
        closedAt,
      },
      update: {
        status: 'CLOSED',
        kamarTersedia: metrics.kamarTersedia,
        kamarTerjual: metrics.kamarTerjual,
        okupansi: metrics.okupansi,
        adr: metrics.adr,
        revpar: metrics.revpar,
        pendapatanKamar: metrics.pendapatanKamar,
        pendapatanLain: metrics.pendapatanLain,
        totalPajak: metrics.totalPajak,
        totalServiceCharge: metrics.totalServiceCharge,
        totalBiaya: metrics.totalBiaya,
        biayaOperasional: metrics.biayaOperasional,
        biayaAlokasi: metrics.biayaAlokasi,
        komisiOta: metrics.komisiOta,
        labaOperasional: metrics.labaOperasional,
        labaKas: metrics.labaKas,
        uangMasuk: metrics.uangMasuk,
        uangKeluar: metrics.uangKeluar,
        posisiKas: metrics.posisiKas,
        closedById: user.id,
        closedAt,
      },
      include: {
        closedBy: { select: USER_PUBLIC_SELECT },
      },
    })

    await createAuditLog({
      userId: user.id,
      aksi: 'CLOSE_DAY',
      entitas: 'DailyClose',
      entitasId: dailyClose.id,
      dataAfter: {
        tanggalBisnis: tanggal,
        status: 'CLOSED',
        okupansi: metrics.okupansi,
        totalPendapatan: metrics.totalPendapatan,
        totalBiaya: metrics.totalBiaya,
        labaOperasional: metrics.labaOperasional,
        postedChargesCount,
      },
      keterangan: `Tutup hari bisnis ${tanggal} (${postedChargesCount} tagihan kamar diposting)`,
    })

    return NextResponse.json({ dailyClose, postedChargesCount })
  } catch (err) {
    return handleApiError(err, 'POST /api/tutup-hari')
  }
}
