import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { hitungJumlahMalam } from '@/lib/format'
import { calculateTaxAndService } from '@/lib/calculations'
import {
  HttpError,
  computeReservationTotals,
  findRoomConflict,
  generateReferenceCode,
  getActiveTaxConfig,
  maskGuestIdentity,
  recalculateFolio,
} from '@/lib/reservasi-folio'

export async function GET(request: NextRequest) {
  const auth = await authorizeApi('reservasi.read')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const checkAvailability = searchParams.get('checkAvailability')

    if (checkAvailability === '1' || checkAvailability === 'true') {
      const checkInParam = searchParams.get('checkIn')
      const checkOutParam = searchParams.get('checkOut')

      if (!checkInParam || !checkOutParam) {
        return NextResponse.json(
          { error: 'Parameter checkIn dan checkOut wajib diisi' },
          { status: 400 }
        )
      }

      const checkInDate = new Date(checkInParam)
      const checkOutDate = new Date(checkOutParam)

      if (
        Number.isNaN(checkInDate.getTime()) ||
        Number.isNaN(checkOutDate.getTime()) ||
        checkOutDate <= checkInDate
      ) {
        return NextResponse.json(
          { error: 'Rentang tanggal check-in dan check-out tidak valid' },
          { status: 400 }
        )
      }

      const rooms = await prisma.room.findMany({
        where: {
          aktif: true,
          status: { not: 'OUT_OF_ORDER' },
          reservations: {
            none: {
              status: { in: ['CONFIRMED', 'CHECKED_IN'] },
              tanggalCheckIn: { lt: checkOutDate },
              tanggalCheckOut: { gt: checkInDate },
            },
          },
        },
        include: { roomType: true },
        orderBy: { nomor: 'asc' },
      })

      return NextResponse.json({ rooms })
    }

    const status = searchParams.get('status')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: Record<string, unknown> = {}
    if (status) {
      where.status = status
    }

    if (from || to) {
      const dateFilter: Record<string, Date> = {}
      if (from) {
        const fromDate = new Date(from)
        if (Number.isNaN(fromDate.getTime())) {
          return NextResponse.json({ error: 'Format tanggal from tidak valid' }, { status: 400 })
        }
        dateFilter.gte = fromDate
      }
      if (to) {
        const toDate = to.length === 10 ? new Date(`${to}T23:59:59.999Z`) : new Date(to)
        if (Number.isNaN(toDate.getTime())) {
          return NextResponse.json({ error: 'Format tanggal to tidak valid' }, { status: 400 })
        }
        dateFilter.lte = toDate
      }
      where.tanggalCheckIn = dateFilter
    }

    const reservations = await prisma.reservation.findMany({
      where,
      include: {
        guest: true,
        room: { include: { roomType: true } },
        ratePlan: true,
        folio: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const sanitized = reservations.map((res) => ({
      ...res,
      guest: maskGuestIdentity(res.guest),
    }))

    return NextResponse.json({ reservations: sanitized })
  } catch (err) {
    return handleApiError(err, 'GET /api/reservasi')
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApi('reservasi.write')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const {
      guestId,
      roomId,
      ratePlanId,
      tanggalCheckIn,
      tanggalCheckOut,
      jumlahDewasa = 1,
      jumlahAnak = 0,
      tarifPerMalam: tarifOverride,
      sumberBooking = 'WALK_IN',
      namaOta,
      komisiOtaPct,
      status: requestedStatus,
      diskonPct,
      diskonNominal,
      alasanDiskon,
      approvedBy,
      extraBed = false,
      biayaExtraBed,
      earlyCheckIn = false,
      lateCheckOut = false,
      biayaTambahan = 0,
      catatan,
      walkIn = false,
    } = body

    if (!guestId || !tanggalCheckIn || !tanggalCheckOut) {
      return NextResponse.json(
        { error: 'guestId, tanggalCheckIn, dan tanggalCheckOut wajib diisi' },
        { status: 400 }
      )
    }

    const ci = new Date(tanggalCheckIn)
    const co = new Date(tanggalCheckOut)
    if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) {
      return NextResponse.json(
        { error: 'Format tanggal check-in atau check-out tidak valid' },
        { status: 400 }
      )
    }

    const jumlahMalam = hitungJumlahMalam(ci, co)
    if (jumlahMalam <= 0) {
      return NextResponse.json(
        { error: 'Tanggal check-out harus setelah tanggal check-in' },
        { status: 400 }
      )
    }

    const guest = await prisma.guest.findUnique({ where: { id: guestId } })
    if (!guest) {
      return NextResponse.json({ error: 'Data tamu tidak ditemukan' }, { status: 404 })
    }

    if (walkIn && !roomId) {
      return NextResponse.json(
        { error: 'Kamar wajib dipilih untuk reservasi walk-in' },
        { status: 400 }
      )
    }

    let ratePlan = null
    if (ratePlanId) {
      ratePlan = await prisma.ratePlan.findUnique({ where: { id: ratePlanId } })
      if (!ratePlan) {
        return NextResponse.json({ error: 'Rate plan tidak ditemukan' }, { status: 404 })
      }
    }

    const hasOverride =
      tarifOverride !== undefined && tarifOverride !== null && tarifOverride !== ''
    const tarifPerMalam = hasOverride ? Number(tarifOverride) : ratePlan?.tarifDasar

    if (tarifPerMalam === undefined || Number.isNaN(tarifPerMalam) || tarifPerMalam < 0) {
      return NextResponse.json(
        { error: 'Tarif per malam atau rate plan wajib diisi dengan benar' },
        { status: 400 }
      )
    }

    const pctDiscount = diskonPct ? Number(diskonPct) : 0
    const nomDiscount = diskonNominal ? Number(diskonNominal) : 0
    if ((pctDiscount > 0 || nomDiscount > 0) && (!alasanDiskon || !String(alasanDiskon).trim())) {
      return NextResponse.json(
        { error: 'Alasan diskon wajib diisi jika memberikan diskon' },
        { status: 400 }
      )
    }

    const taxConfig = await getActiveTaxConfig(prisma)
    const { baseTotal, totalDiskon, taxResult } = computeReservationTotals(
      {
        tarifPerMalam,
        jumlahMalam,
        diskonPct: pctDiscount || null,
        diskonNominal: nomDiscount || null,
        extraBed: Boolean(extraBed),
        biayaExtraBed: biayaExtraBed ? Number(biayaExtraBed) : null,
        biayaTambahan: biayaTambahan ? Number(biayaTambahan) : 0,
      },
      taxConfig
    )

    const kodeBooking = generateReferenceCode('RES')
    const nomorFolio = generateReferenceCode('FOL')
    const finalStatus = walkIn
      ? 'CHECKED_IN'
      : requestedStatus === 'TENTATIVE'
        ? 'TENTATIVE'
        : 'CONFIRMED'

    const result = await prisma.$transaction(async (tx) => {
      let assignedRoom = null
      if (roomId) {
        assignedRoom = await tx.room.findUnique({ where: { id: roomId } })
        if (!assignedRoom || !assignedRoom.aktif) {
          throw new HttpError('Kamar tidak ditemukan atau tidak aktif', 404)
        }
        if (assignedRoom.status === 'OUT_OF_ORDER') {
          throw new HttpError('Kamar sedang Out of Order dan tidak dapat dipesan', 400)
        }
        if (walkIn && assignedRoom.status === 'TERISI') {
          throw new HttpError('Kamar sedang terisi', 409)
        }
        const conflict = await findRoomConflict(tx, roomId, ci, co)
        if (conflict) {
          throw new HttpError(
            `Kamar sudah memiliki reservasi bentrok (${conflict.kodeBooking})`,
            409
          )
        }
      }

      const reservation = await tx.reservation.create({
        data: {
          kodeBooking,
          guestId,
          roomId: roomId || null,
          ratePlanId: ratePlanId || null,
          tanggalCheckIn: ci,
          tanggalCheckOut: co,
          jumlahMalam,
          jumlahDewasa: Number(jumlahDewasa) || 1,
          jumlahAnak: Number(jumlahAnak) || 0,
          tarifPerMalam,
          totalTarif: taxResult.subtotal,
          totalPajak: taxResult.pajak,
          totalServiceCharge: taxResult.serviceCharge,
          totalKeseluruhan: taxResult.total,
          sumberBooking,
          namaOta: namaOta || null,
          komisiOtaPct: komisiOtaPct ? Number(komisiOtaPct) : null,
          status: finalStatus,
          diskonPct: pctDiscount || null,
          diskonNominal: nomDiscount || null,
          alasanDiskon: alasanDiskon ? String(alasanDiskon).trim() : null,
          approvedBy: approvedBy || null,
          extraBed: Boolean(extraBed),
          biayaExtraBed: biayaExtraBed ? Number(biayaExtraBed) : null,
          earlyCheckIn: Boolean(earlyCheckIn),
          lateCheckOut: Boolean(lateCheckOut),
          biayaTambahan: biayaTambahan ? Number(biayaTambahan) : 0,
          catatan: catatan || null,
          actualCheckIn: walkIn ? new Date() : null,
          createdById: auth.user.id,
        },
        include: {
          guest: true,
          room: { include: { roomType: true } },
          ratePlan: true,
        },
      })

      let folio = await tx.folio.create({
        data: {
          nomorFolio,
          reservationId: reservation.id,
          status: 'OPEN',
        },
      })

      if (walkIn && assignedRoom) {
        await tx.room.update({
          where: { id: assignedRoom.id },
          data: { status: 'TERISI' },
        })

        const perNightBase = Math.round(Math.max(0, baseTotal - totalDiskon) / jumlahMalam)
        const firstNightTax = calculateTaxAndService({
          baseAmount: perNightBase,
          pajakDaerahPct: taxConfig.pajakDaerahPct,
          serviceChargePct: taxConfig.serviceChargePct,
          modeHarga: taxConfig.modeHarga,
        })

        await tx.folioCharge.create({
          data: {
            folioId: folio.id,
            tanggal: new Date(),
            kategori: 'KAMAR',
            deskripsi: `Biaya Kamar Malam 1 - Kamar ${assignedRoom.nomor}`,
            nominal: firstNightTax.subtotal,
            pajak: firstNightTax.pajak,
            serviceCharge: firstNightTax.serviceCharge,
            total: firstNightTax.total,
            createdById: auth.user.id,
          },
        })

        folio = await recalculateFolio(tx, folio.id)
      }

      const otaPct = komisiOtaPct ? Number(komisiOtaPct) : 0
      if (typeof sumberBooking === 'string' && sumberBooking.startsWith('OTA_') && otaPct > 0) {
        const komisiCategory = await tx.expenseCategory.findUnique({
          where: { id: 'ec-komisi-ota' },
        })
        if (komisiCategory) {
          const komisiNominal = Math.round(taxResult.subtotal * (otaPct / 100))
          if (komisiNominal > 0) {
            await tx.expense.create({
              data: {
                tanggal: new Date(),
                categoryId: komisiCategory.id,
                departemen: komisiCategory.departemen,
                nominal: komisiNominal,
                metodeBayar: 'TRANSFER',
                vendor: namaOta || sumberBooking,
                catatan: `Komisi OTA ${otaPct}% untuk reservasi ${kodeBooking}`,
                jenisBeban: 'OPERASIONAL',
                statusApproval: 'APPROVED',
                createdById: auth.user.id,
              },
            })
          }
        }
      }

      return { reservation, folio }
    })

    await createAuditLog({
      userId: auth.user.id,
      aksi: 'CREATE',
      entitas: 'Reservation',
      entitasId: result.reservation.id,
      dataAfter: {
        kodeBooking: result.reservation.kodeBooking,
        guestId: result.reservation.guestId,
        roomId: result.reservation.roomId,
        status: result.reservation.status,
        totalKeseluruhan: result.reservation.totalKeseluruhan,
        walkIn: Boolean(walkIn),
      },
      keterangan: `Membuat reservasi ${result.reservation.kodeBooking}${walkIn ? ' (Walk-In Check-In)' : ''}`,
    })

    return NextResponse.json(
      {
        reservation: {
          ...result.reservation,
          guest: maskGuestIdentity(result.reservation.guest),
          folio: result.folio,
        },
        folio: result.folio,
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return handleApiError(err, 'POST /api/reservasi')
  }
}
