import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { calculateTaxAndService } from '@/lib/calculations'

const ALLOWED_KELAS_MUSIM = ['NORMAL', 'WEEKEND', 'HIGH_SEASON', 'LIBUR'] as const
const MAX_PREVIEW_NIGHTS = 366

function normalizeDateOnly(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T00:00:00.000Z`)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

export async function GET(request: NextRequest) {
  try {
    const { error } = await authorizeApi('tarif.read')
    if (error) return error

    const { searchParams } = new URL(request.url)
    const roomTypeId = searchParams.get('roomTypeId')?.trim() || ''
    const ratePlanId = searchParams.get('ratePlanId')?.trim() || ''
    const checkInParam = searchParams.get('checkIn')?.trim() || ''
    const checkOutParam = searchParams.get('checkOut')?.trim() || ''

    const [ratePlans, roomTypes] = await Promise.all([
      prisma.ratePlan.findMany({
        include: {
          roomType: true,
          rateCalendars: {
            where: { aktif: true },
            orderBy: { tanggal: 'asc' },
          },
        },
        orderBy: [{ roomType: { nama: 'asc' } }, { tarifDasar: 'asc' }],
      }),
      prisma.roomType.findMany({
        orderBy: { nama: 'asc' },
      }),
    ])

    if (checkInParam && checkOutParam) {
      const checkInDate = normalizeDateOnly(checkInParam)
      const checkOutDate = normalizeDateOnly(checkOutParam)

      if (!checkInDate || !checkOutDate) {
        return NextResponse.json(
          { error: 'Format tanggal check-in atau check-out tidak valid' },
          { status: 400 }
        )
      }

      if (checkOutDate <= checkInDate) {
        return NextResponse.json(
          { error: 'Tanggal check-out harus setelah tanggal check-in' },
          { status: 400 }
        )
      }

      let selectedPlan = ratePlanId
        ? ratePlans.find((rp) => rp.id === ratePlanId)
        : undefined

      if (!selectedPlan && !ratePlanId && roomTypeId) {
        const activePlansForType = ratePlans.filter(
          (rp) => rp.roomTypeId === roomTypeId && rp.aktif
        )
        selectedPlan =
          activePlansForType.find((rp) => rp.sumber === 'UMUM') ?? activePlansForType[0]
      }

      if (!ratePlanId && !roomTypeId) {
        return NextResponse.json(
          { error: 'Parameter ratePlanId atau roomTypeId wajib diisi untuk kalkulasi tarif' },
          { status: 400 }
        )
      }

      if (!selectedPlan) {
        return NextResponse.json(
          { error: 'Rate plan tidak ditemukan' },
          { status: 404 }
        )
      }

      const taxConfig = await prisma.taxConfig.findFirst({
        where: { aktif: true },
        orderBy: { berlakuSejak: 'desc' },
      })

      const calendarByDate = new Map<
        string,
        { kelasMusim: string; tarifOverride: number | null }
      >()
      for (const rc of selectedPlan.rateCalendars) {
        if (!rc.aktif) continue
        const key = rc.tanggal.toISOString().slice(0, 10)
        calendarByDate.set(key, {
          kelasMusim: rc.kelasMusim,
          tarifOverride: rc.tarifOverride,
        })
      }

      const rincianPerMalam: Array<{
        tanggal: string
        kelasMusim: string
        tarif: number
        isOverride: boolean
      }> = []

      let baseTotal = 0
      const cursor = new Date(checkInDate)
      while (cursor < checkOutDate) {
        if (rincianPerMalam.length >= MAX_PREVIEW_NIGHTS) {
          return NextResponse.json(
            { error: `Rentang tanggal maksimal ${MAX_PREVIEW_NIGHTS} malam` },
            { status: 400 }
          )
        }

        const dateKey = cursor.toISOString().slice(0, 10)
        const override = calendarByDate.get(dateKey)
        const hasOverride = override?.tarifOverride !== null && override?.tarifOverride !== undefined
        const tarif = hasOverride ? Number(override!.tarifOverride) : selectedPlan.tarifDasar

        rincianPerMalam.push({
          tanggal: dateKey,
          kelasMusim: override?.kelasMusim ?? 'NORMAL',
          tarif,
          isOverride: hasOverride,
        })
        baseTotal += tarif
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }

      const pajakDaerahPct = taxConfig?.pajakDaerahPct ?? 10
      const serviceChargePct = taxConfig?.serviceChargePct ?? 10
      const modeHarga: 'INCLUSIVE' | 'EXCLUSIVE' =
        taxConfig?.modeHarga === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE'

      const taxCalculation = calculateTaxAndService({
        baseAmount: baseTotal,
        pajakDaerahPct,
        serviceChargePct,
        modeHarga,
      })

      return NextResponse.json({
        ratePlans,
        roomTypes,
        pricePreview: {
          ratePlanId: selectedPlan.id,
          ratePlanNama: selectedPlan.nama,
          roomTypeId: selectedPlan.roomTypeId,
          checkIn: checkInDate.toISOString().slice(0, 10),
          checkOut: checkOutDate.toISOString().slice(0, 10),
          jumlahMalam: rincianPerMalam.length,
          tarifDasar: selectedPlan.tarifDasar,
          tarifRataRata: Math.round(baseTotal / rincianPerMalam.length),
          baseTotal: Math.round(baseTotal),
          pajakDaerahPct,
          serviceChargePct,
          modeHarga,
          ...taxCalculation,
          rincianPerMalam,
        },
      })
    }

    return NextResponse.json({ ratePlans, roomTypes })
  } catch (err) {
    return handleApiError(err, 'GET /api/tarif')
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await authorizeApi('tarif.write')
    if (error) return error

    const body = await request.json()

    if (body.action === 'calendar') {
      const { ratePlanId, tanggal, kelasMusim, tarifOverride } = body

      if (!ratePlanId || typeof ratePlanId !== 'string') {
        return NextResponse.json({ error: 'Rate plan wajib dipilih' }, { status: 400 })
      }
      if (!tanggal || typeof tanggal !== 'string') {
        return NextResponse.json({ error: 'Tanggal wajib diisi' }, { status: 400 })
      }

      const normalizedDate = normalizeDateOnly(tanggal)
      if (!normalizedDate) {
        return NextResponse.json({ error: 'Format tanggal tidak valid' }, { status: 400 })
      }

      const ratePlan = await prisma.ratePlan.findUnique({ where: { id: ratePlanId } })
      if (!ratePlan) {
        return NextResponse.json({ error: 'Rate plan tidak ditemukan' }, { status: 404 })
      }

      const kelasMusimVal =
        typeof kelasMusim === 'string' && kelasMusim.trim() ? kelasMusim.trim() : 'NORMAL'
      if (!ALLOWED_KELAS_MUSIM.includes(kelasMusimVal as (typeof ALLOWED_KELAS_MUSIM)[number])) {
        return NextResponse.json({ error: 'Kelas musim tidak valid' }, { status: 400 })
      }

      let parsedOverride: number | null = null
      if (tarifOverride !== undefined && tarifOverride !== null && tarifOverride !== '') {
        const num = Number(tarifOverride)
        if (Number.isNaN(num) || num < 0) {
          return NextResponse.json(
            { error: 'Tarif override harus berupa angka tidak negatif' },
            { status: 400 }
          )
        }
        parsedOverride = Math.round(num)
      }

      const existing = await prisma.rateCalendar.findUnique({
        where: {
          ratePlanId_tanggal: {
            ratePlanId,
            tanggal: normalizedDate,
          },
        },
      })

      const rateCalendar = await prisma.rateCalendar.upsert({
        where: {
          ratePlanId_tanggal: {
            ratePlanId,
            tanggal: normalizedDate,
          },
        },
        update: {
          kelasMusim: kelasMusimVal,
          tarifOverride: parsedOverride,
          aktif: true,
        },
        create: {
          ratePlanId,
          tanggal: normalizedDate,
          kelasMusim: kelasMusimVal,
          tarifOverride: parsedOverride,
        },
      })

      const dateStr = normalizedDate.toISOString().slice(0, 10)
      await createAuditLog({
        userId: user.id,
        aksi: existing ? 'UPDATE' : 'CREATE',
        entitas: 'RateCalendar',
        entitasId: rateCalendar.id,
        dataBefore: existing
          ? {
              kelasMusim: existing.kelasMusim,
              tarifOverride: existing.tarifOverride,
              aktif: existing.aktif,
            }
          : undefined,
        dataAfter: {
          ratePlanId,
          tanggal: dateStr,
          kelasMusim: rateCalendar.kelasMusim,
          tarifOverride: rateCalendar.tarifOverride,
        },
        keterangan: `Mengatur kalender tarif ${ratePlan.nama} tanggal ${dateStr}`,
      })

      return NextResponse.json({ rateCalendar }, { status: existing ? 200 : 201 })
    }

    const { nama, roomTypeId, tarifDasar, sumber, inklusi } = body

    if (!nama || typeof nama !== 'string' || !nama.trim()) {
      return NextResponse.json({ error: 'Nama rate plan wajib diisi' }, { status: 400 })
    }
    if (!roomTypeId || typeof roomTypeId !== 'string') {
      return NextResponse.json({ error: 'Tipe kamar wajib dipilih' }, { status: 400 })
    }

    const parsedTarif = Number(tarifDasar)
    if (tarifDasar === undefined || tarifDasar === null || Number.isNaN(parsedTarif) || parsedTarif < 0) {
      return NextResponse.json(
        { error: 'Tarif dasar wajib diisi dengan angka tidak negatif' },
        { status: 400 }
      )
    }

    const roomType = await prisma.roomType.findUnique({ where: { id: roomTypeId } })
    if (!roomType) {
      return NextResponse.json({ error: 'Tipe kamar tidak ditemukan' }, { status: 404 })
    }

    let formattedInklusi: string | null = null
    if (Array.isArray(inklusi)) {
      formattedInklusi = JSON.stringify(inklusi)
    } else if (typeof inklusi === 'string' && inklusi.trim()) {
      formattedInklusi = inklusi.trim()
    }

    const sumberVal = typeof sumber === 'string' && sumber.trim() ? sumber.trim() : 'UMUM'

    const ratePlan = await prisma.ratePlan.create({
      data: {
        nama: nama.trim(),
        roomTypeId,
        tarifDasar: Math.round(parsedTarif),
        sumber: sumberVal,
        inklusi: formattedInklusi,
      },
      include: {
        roomType: true,
        rateCalendars: true,
      },
    })

    await createAuditLog({
      userId: user.id,
      aksi: 'CREATE',
      entitas: 'RatePlan',
      entitasId: ratePlan.id,
      dataAfter: {
        nama: ratePlan.nama,
        roomTypeId: ratePlan.roomTypeId,
        tarifDasar: ratePlan.tarifDasar,
        sumber: ratePlan.sumber,
        inklusi: ratePlan.inklusi,
      },
      keterangan: `Membuat rate plan: ${ratePlan.nama}`,
    })

    return NextResponse.json({ ratePlan }, { status: 201 })
  } catch (err) {
    return handleApiError(err, 'POST /api/tarif')
  }
}
