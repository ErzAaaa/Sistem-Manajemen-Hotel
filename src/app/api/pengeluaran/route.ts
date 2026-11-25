import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import {
  countDaysInclusive,
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

const VALID_DEPARTEMEN = ['KAMAR', 'FNB', 'TAK_TERDISTRIBUSI', 'TETAP'] as const
const VALID_METODE_BAYAR = ['TUNAI', 'TRANSFER', 'KAS_KECIL'] as const
const VALID_JENIS_BEBAN = ['OPERASIONAL', 'INVESTASI'] as const
const VALID_PETTY_CASH_JENIS = [
  'SALDO_AWAL',
  'TOP_UP',
  'PENGELUARAN',
  'REKONSILIASI',
] as const

function parseDateInput(value?: string): Date | null {
  if (!value) return new Date(`${getTodayWIB()}T00:00:00.000Z`)
  const datePart = value.slice(0, 10)
  if (isValidDateStr(datePart)) {
    return new Date(`${datePart}T00:00:00.000Z`)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function computeNextPettyCashSaldo(
  jenis: string,
  nominal: number,
  tx: typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0] = prisma
): Promise<number> {
  const latest = await tx.pettyCash.findFirst({
    orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
    select: { saldo: true },
  })
  const prevSaldo = latest?.saldo ?? 0
  const amount = Math.round(nominal)

  switch (jenis) {
    case 'SALDO_AWAL':
    case 'REKONSILIASI':
      return amount
    case 'TOP_UP':
      return Math.round(prevSaldo + amount)
    case 'PENGELUARAN':
      return Math.round(prevSaldo - amount)
    default:
      return Math.round(prevSaldo)
  }
}

export async function GET(request: NextRequest) {
  const { error } = await authorizeApi('pengeluaran.read')
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const departemen = searchParams.get('departemen')

    const expenseWhere: Record<string, unknown> = {}
    const pettyCashWhere: Record<string, unknown> = {}

    if (from || to) {
      const tanggalFilter: Record<string, Date> = {}
      if (from) {
        if (!isValidDateStr(from)) {
          return NextResponse.json(
            { error: 'Format tanggal "from" tidak valid (gunakan YYYY-MM-DD)' },
            { status: 400 }
          )
        }
        tanggalFilter.gte = getDayBounds(from).dayStart
      }
      if (to) {
        if (!isValidDateStr(to)) {
          return NextResponse.json(
            { error: 'Format tanggal "to" tidak valid (gunakan YYYY-MM-DD)' },
            { status: 400 }
          )
        }
        tanggalFilter.lte = getDayBounds(to).dayEnd
      }
      expenseWhere.tanggal = tanggalFilter
      pettyCashWhere.tanggal = tanggalFilter
    }

    if (departemen && departemen !== 'ALL') {
      expenseWhere.departemen = departemen
    }

    const [expenses, categories, recurringExpenses, pettyCash, latestPettyCash] =
      await Promise.all([
        prisma.expense.findMany({
          where: expenseWhere,
          include: {
            category: true,
            createdBy: { select: USER_PUBLIC_SELECT },
            approvedBy: { select: USER_PUBLIC_SELECT },
          },
          orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
        }),
        prisma.expenseCategory.findMany({
          where: { aktif: true },
          orderBy: [{ departemen: 'asc' }, { nama: 'asc' }],
        }),
        prisma.recurringExpense.findMany({
          include: { category: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.pettyCash.findMany({
          where: pettyCashWhere,
          orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
        }),
        prisma.pettyCash.findFirst({
          orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
          select: { saldo: true },
        }),
      ])

    return NextResponse.json({
      expenses,
      categories,
      recurringExpenses,
      pettyCash,
      pettyCashSaldo: latestPettyCash?.saldo ?? 0,
    })
  } catch (err) {
    return handleApiError(err, 'GET /api/pengeluaran')
  }
}

export async function POST(request: NextRequest) {
  const { user, error } = await authorizeApi('pengeluaran.write')
  if (error) return error

  try {
    const body = await request.json()
    const { type } = body

    if (type === 'category') {
      const nama = typeof body.nama === 'string' ? body.nama.trim() : ''
      const departemen = typeof body.departemen === 'string' ? body.departemen.trim() : ''
      const kodeUsali =
        typeof body.kodeUsali === 'string' && body.kodeUsali.trim()
          ? body.kodeUsali.trim()
          : null

      if (!nama || !departemen) {
        return NextResponse.json(
          { error: 'Nama kategori dan departemen wajib diisi' },
          { status: 400 }
        )
      }

      if (!VALID_DEPARTEMEN.includes(departemen as (typeof VALID_DEPARTEMEN)[number])) {
        return NextResponse.json(
          { error: 'Departemen tidak valid (KAMAR, FNB, TAK_TERDISTRIBUSI, TETAP)' },
          { status: 400 }
        )
      }

      const category = await prisma.expenseCategory.create({
        data: { nama, departemen, kodeUsali },
      })

      await createAuditLog({
        userId: user.id,
        aksi: 'CREATE',
        entitas: 'ExpenseCategory',
        entitasId: category.id,
        dataAfter: category as unknown as Record<string, unknown>,
        keterangan: `Membuat kategori pengeluaran: ${nama} (${departemen})`,
      })

      return NextResponse.json({ category }, { status: 201 })
    }

    if (type === 'recurring') {
      const nama = typeof body.nama === 'string' ? body.nama.trim() : ''
      const categoryId = typeof body.categoryId === 'string' ? body.categoryId : ''
      const nominal = Math.round(Number(body.nominal))
      const periodeAwal = parseDateInput(body.periodeAwal)
      const periodeAkhir = parseDateInput(body.periodeAkhir)

      if (!nama || !categoryId || !Number.isFinite(nominal) || nominal <= 0) {
        return NextResponse.json(
          { error: 'Nama, kategori, dan nominal (> 0) wajib diisi' },
          { status: 400 }
        )
      }

      if (!periodeAwal || !periodeAkhir || periodeAkhir < periodeAwal) {
        return NextResponse.json(
          { error: 'Periode awal dan periode akhir tidak valid' },
          { status: 400 }
        )
      }

      const category = await prisma.expenseCategory.findUnique({
        where: { id: categoryId },
      })
      if (!category) {
        return NextResponse.json(
          { error: 'Kategori pengeluaran tidak ditemukan' },
          { status: 404 }
        )
      }

      const startStr = periodeAwal.toISOString().slice(0, 10)
      const endStr = periodeAkhir.toISOString().slice(0, 10)
      const days = countDaysInclusive(startStr, endStr)
      const alokasiHarian = Math.round(nominal / Math.max(1, days))

      const recurringExpense = await prisma.recurringExpense.create({
        data: {
          nama,
          categoryId,
          nominal,
          periodeAwal,
          periodeAkhir,
          alokasiHarian,
        },
        include: { category: true },
      })

      await createAuditLog({
        userId: user.id,
        aksi: 'CREATE',
        entitas: 'RecurringExpense',
        entitasId: recurringExpense.id,
        dataAfter: {
          nama,
          categoryId,
          nominal,
          alokasiHarian,
          periodeAwal: startStr,
          periodeAkhir: endStr,
        },
        keterangan: `Membuat beban berulang: ${nama} (alokasi harian Rp ${alokasiHarian})`,
      })

      return NextResponse.json({ recurringExpense }, { status: 201 })
    }

    if (type === 'pettyCash') {
      const tanggal = parseDateInput(body.tanggal)
      const jenis = typeof body.jenis === 'string' ? body.jenis : ''
      const nominal = Math.round(Number(body.nominal))
      const keterangan =
        typeof body.keterangan === 'string' && body.keterangan.trim()
          ? body.keterangan.trim()
          : null

      if (!tanggal) {
        return NextResponse.json(
          { error: 'Format tanggal tidak valid' },
          { status: 400 }
        )
      }

      if (
        !VALID_PETTY_CASH_JENIS.includes(
          jenis as (typeof VALID_PETTY_CASH_JENIS)[number]
        )
      ) {
        return NextResponse.json(
          {
            error:
              'Jenis kas kecil tidak valid (SALDO_AWAL, TOP_UP, PENGELUARAN, REKONSILIASI)',
          },
          { status: 400 }
        )
      }

      if (!Number.isFinite(nominal) || nominal < 0 || (jenis !== 'SALDO_AWAL' && jenis !== 'REKONSILIASI' && nominal <= 0)) {
        return NextResponse.json(
          { error: 'Nominal kas kecil tidak valid' },
          { status: 400 }
        )
      }

      const pettyCash = await prisma.$transaction(async (tx) => {
        const saldo = await computeNextPettyCashSaldo(jenis, nominal, tx)
        return tx.pettyCash.create({
          data: {
            tanggal,
            jenis,
            nominal,
            saldo,
            keterangan,
          },
        })
      })

      await createAuditLog({
        userId: user.id,
        aksi: 'CREATE',
        entitas: 'PettyCash',
        entitasId: pettyCash.id,
        dataAfter: {
          tanggal: pettyCash.tanggal.toISOString().slice(0, 10),
          jenis,
          nominal,
          saldo: pettyCash.saldo,
          keterangan,
        },
        keterangan: `Transaksi kas kecil (${jenis}): Rp ${nominal}`,
      })

      return NextResponse.json({ pettyCash }, { status: 201 })
    }

    // Regular expense
    const tanggal = parseDateInput(body.tanggal)
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : ''
    const nominal = Math.round(Number(body.nominal))
    const metodeBayar = typeof body.metodeBayar === 'string' ? body.metodeBayar : ''
    const vendor =
      typeof body.vendor === 'string' && body.vendor.trim() ? body.vendor.trim() : null
    const catatan =
      typeof body.catatan === 'string' && body.catatan.trim() ? body.catatan.trim() : null
    const jenisBeban =
      typeof body.jenisBeban === 'string' && body.jenisBeban
        ? body.jenisBeban
        : 'OPERASIONAL'

    if (!tanggal || !categoryId || !Number.isFinite(nominal) || nominal <= 0) {
      return NextResponse.json(
        { error: 'Tanggal, kategori, dan nominal (> 0) wajib diisi' },
        { status: 400 }
      )
    }

    if (
      !VALID_METODE_BAYAR.includes(
        metodeBayar as (typeof VALID_METODE_BAYAR)[number]
      )
    ) {
      return NextResponse.json(
        { error: 'Metode bayar tidak valid (TUNAI, TRANSFER, KAS_KECIL)' },
        { status: 400 }
      )
    }

    if (
      !VALID_JENIS_BEBAN.includes(jenisBeban as (typeof VALID_JENIS_BEBAN)[number])
    ) {
      return NextResponse.json(
        { error: 'Jenis beban tidak valid (OPERASIONAL, INVESTASI)' },
        { status: 400 }
      )
    }

    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId },
    })
    if (!category) {
      return NextResponse.json(
        { error: 'Kategori pengeluaran tidak ditemukan' },
        { status: 404 }
      )
    }

    const departemen =
      typeof body.departemen === 'string' && body.departemen.trim()
        ? body.departemen.trim()
        : category.departemen

    if (!VALID_DEPARTEMEN.includes(departemen as (typeof VALID_DEPARTEMEN)[number])) {
      return NextResponse.json(
        { error: 'Departemen tidak valid' },
        { status: 400 }
      )
    }

    const isAutoApproved =
      nominal < 1000000 || user.role === 'OWNER' || user.role === 'MANAJER'
    const statusApproval = isAutoApproved ? 'APPROVED' : 'PENDING'
    const approvedById = isAutoApproved ? user.id : null

    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          tanggal,
          categoryId,
          departemen,
          nominal,
          metodeBayar,
          vendor,
          catatan,
          jenisBeban,
          statusApproval,
          approvedById,
          createdById: user.id,
        },
        include: {
          category: true,
          createdBy: { select: USER_PUBLIC_SELECT },
          approvedBy: { select: USER_PUBLIC_SELECT },
        },
      })

      let pettyCashEntry = null
      if (metodeBayar === 'KAS_KECIL') {
        const saldo = await computeNextPettyCashSaldo('PENGELUARAN', nominal, tx)
        const ketParts = [`Pengeluaran ${category.nama}`]
        if (vendor) ketParts.push(`(${vendor})`)
        if (catatan) ketParts.push(`- ${catatan}`)
        pettyCashEntry = await tx.pettyCash.create({
          data: {
            tanggal,
            jenis: 'PENGELUARAN',
            nominal,
            saldo,
            keterangan: ketParts.join(' '),
          },
        })
      }

      return { expense, pettyCashEntry }
    })

    await createAuditLog({
      userId: user.id,
      aksi: 'CREATE',
      entitas: 'Expense',
      entitasId: result.expense.id,
      dataAfter: {
        tanggal: tanggal.toISOString().slice(0, 10),
        categoryId,
        departemen,
        nominal,
        metodeBayar,
        jenisBeban,
        statusApproval,
      },
      keterangan: `Mencatat pengeluaran ${category.nama} sebesar Rp ${nominal} (${statusApproval})`,
    })

    return NextResponse.json(
      {
        expense: result.expense,
        pettyCash: result.pettyCashEntry,
      },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err, 'POST /api/pengeluaran')
  }
}
