import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { hitungJumlahMalam } from '@/lib/format'
import {
  HttpError,
  computeReservationTotals,
  findRoomConflict,
  getActiveTaxConfig,
  maskGuestIdentity,
  recalculateFolio,
} from '@/lib/reservasi-folio'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeApi('reservasi.read')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        guest: true,
        room: { include: { roomType: true } },
        ratePlan: true,
        folio: {
          include: {
            charges: { orderBy: { createdAt: 'asc' } },
            payments: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    })

    if (!reservation) {
      return NextResponse.json({ error: 'Reservasi tidak ditemukan' }, { status: 404 })
    }

    return NextResponse.json({
      reservation: {
        ...reservation,
        guest: maskGuestIdentity(reservation.guest),
      },
    })
  } catch (err) {
    return handleApiError(err, 'GET /api/reservasi/[id]')
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeApi('reservasi.write')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json()
    const { action } = body

    if (!action) {
      return NextResponse.json({ error: 'Parameter action wajib diisi' }, { status: 400 })
    }

    const existing = await prisma.reservation.findUnique({
      where: { id },
      include: {
        room: true,
        folio: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Reservasi tidak ditemukan' }, { status: 404 })
    }

    const dataBefore = {
      status: existing.status,
      roomId: existing.roomId,
      tanggalCheckOut: existing.tanggalCheckOut,
      jumlahMalam: existing.jumlahMalam,
      totalKeseluruhan: existing.totalKeseluruhan,
    }

    let keterangan = ''

    const updated = await prisma.$transaction(async (tx) => {
      switch (action) {
        case 'CHECK_IN': {
          if (!['CONFIRMED', 'TENTATIVE'].includes(existing.status)) {
            throw new HttpError(
              `Reservasi dengan status ${existing.status} tidak dapat check-in`,
              400
            )
          }

          const targetRoomId: string | undefined = body.roomId || existing.roomId || undefined
          if (!targetRoomId) {
            throw new HttpError('Kamar wajib dipilih untuk proses check-in', 400)
          }

          const room = await tx.room.findUnique({ where: { id: targetRoomId } })
          if (!room || !room.aktif) {
            throw new HttpError('Kamar tidak ditemukan atau tidak aktif', 404)
          }
          if (room.status === 'OUT_OF_ORDER') {
            throw new HttpError('Kamar sedang Out of Order', 400)
          }
          if (room.status === 'TERISI') {
            throw new HttpError('Kamar sedang terisi oleh tamu lain', 409)
          }

          const conflict = await findRoomConflict(
            tx,
            targetRoomId,
            existing.tanggalCheckIn,
            existing.tanggalCheckOut,
            existing.id
          )
          if (conflict) {
            throw new HttpError(
              `Kamar memiliki reservasi bentrok (${conflict.kodeBooking})`,
              409
            )
          }

          await tx.room.update({
            where: { id: targetRoomId },
            data: { status: 'TERISI' },
          })

          keterangan = `Check-in reservasi ${existing.kodeBooking} ke kamar ${room.nomor}`
          return tx.reservation.update({
            where: { id },
            data: {
              roomId: targetRoomId,
              status: 'CHECKED_IN',
              actualCheckIn: new Date(),
            },
            include: {
              guest: true,
              room: { include: { roomType: true } },
              ratePlan: true,
              folio: true,
            },
          })
        }

        case 'CHECK_OUT': {
          if (existing.status !== 'CHECKED_IN') {
            throw new HttpError('Hanya tamu berstatus CHECKED_IN yang dapat check-out', 400)
          }

          if (existing.roomId) {
            await tx.room.update({
              where: { id: existing.roomId },
              data: { status: 'TERSEDIA' },
            })
          }

          if (existing.folio) {
            const refreshedFolio = await recalculateFolio(tx, existing.folio.id)
            if (refreshedFolio.balance <= 0) {
              await tx.folio.update({
                where: { id: refreshedFolio.id },
                data: { status: 'CLOSED' },
              })
            }
          }

          keterangan = `Check-out reservasi ${existing.kodeBooking}`
          return tx.reservation.update({
            where: { id },
            data: {
              status: 'CHECKED_OUT',
              actualCheckOut: new Date(),
            },
            include: {
              guest: true,
              room: { include: { roomType: true } },
              ratePlan: true,
              folio: true,
            },
          })
        }

        case 'MOVE_ROOM': {
          if (!['CONFIRMED', 'CHECKED_IN'].includes(existing.status)) {
            throw new HttpError(
              `Reservasi dengan status ${existing.status} tidak dapat pindah kamar`,
              400
            )
          }

          const newRoomId: string | undefined = body.newRoomId
          if (!newRoomId) {
            throw new HttpError('Kamar tujuan (newRoomId) wajib diisi', 400)
          }
          if (newRoomId === existing.roomId) {
            throw new HttpError('Kamar tujuan sama dengan kamar saat ini', 400)
          }

          const newRoom = await tx.room.findUnique({ where: { id: newRoomId } })
          if (!newRoom || !newRoom.aktif) {
            throw new HttpError('Kamar tujuan tidak ditemukan atau tidak aktif', 404)
          }
          if (newRoom.status === 'OUT_OF_ORDER') {
            throw new HttpError('Kamar tujuan sedang Out of Order', 400)
          }
          if (existing.status === 'CHECKED_IN' && newRoom.status === 'TERISI') {
            throw new HttpError('Kamar tujuan sedang terisi', 409)
          }

          const conflict = await findRoomConflict(
            tx,
            newRoomId,
            existing.tanggalCheckIn,
            existing.tanggalCheckOut,
            existing.id
          )
          if (conflict) {
            throw new HttpError(
              `Kamar tujuan memiliki reservasi bentrok (${conflict.kodeBooking})`,
              409
            )
          }

          if (existing.roomId) {
            await tx.room.update({
              where: { id: existing.roomId },
              data: { status: 'TERSEDIA' },
            })
          }

          if (existing.status === 'CHECKED_IN') {
            await tx.room.update({
              where: { id: newRoomId },
              data: { status: 'TERISI' },
            })
          }

          keterangan = `Pindah kamar reservasi ${existing.kodeBooking} ke kamar ${newRoom.nomor}`
          return tx.reservation.update({
            where: { id },
            data: { roomId: newRoomId },
            include: {
              guest: true,
              room: { include: { roomType: true } },
              ratePlan: true,
              folio: true,
            },
          })
        }

        case 'CANCEL': {
          if (['CHECKED_OUT', 'CANCELLED'].includes(existing.status)) {
            throw new HttpError(
              `Reservasi dengan status ${existing.status} tidak dapat dibatalkan`,
              400
            )
          }

          if (existing.roomId && existing.status === 'CHECKED_IN') {
            await tx.room.update({
              where: { id: existing.roomId },
              data: { status: 'TERSEDIA' },
            })
          }

          const alasanBatal = body.alasanBatal ? String(body.alasanBatal).trim() : null
          keterangan = `Membatalkan reservasi ${existing.kodeBooking}${alasanBatal ? `: ${alasanBatal}` : ''}`
          return tx.reservation.update({
            where: { id },
            data: {
              status: 'CANCELLED',
              alasanBatal,
            },
            include: {
              guest: true,
              room: { include: { roomType: true } },
              ratePlan: true,
              folio: true,
            },
          })
        }

        case 'NO_SHOW': {
          if (!['CONFIRMED', 'TENTATIVE'].includes(existing.status)) {
            throw new HttpError(
              `Reservasi dengan status ${existing.status} tidak dapat ditandai NO_SHOW`,
              400
            )
          }

          if (existing.roomId && existing.room?.status === 'TERISI') {
            await tx.room.update({
              where: { id: existing.roomId },
              data: { status: 'TERSEDIA' },
            })
          }

          keterangan = `Menandai reservasi ${existing.kodeBooking} sebagai NO_SHOW`
          return tx.reservation.update({
            where: { id },
            data: { status: 'NO_SHOW' },
            include: {
              guest: true,
              room: { include: { roomType: true } },
              ratePlan: true,
              folio: true,
            },
          })
        }

        case 'EXTEND': {
          if (!['TENTATIVE', 'CONFIRMED', 'CHECKED_IN'].includes(existing.status)) {
            throw new HttpError(
              `Reservasi dengan status ${existing.status} tidak dapat diperpanjang`,
              400
            )
          }

          if (!body.tanggalCheckOut) {
            throw new HttpError('Tanggal check-out baru wajib diisi', 400)
          }

          const newCo = new Date(body.tanggalCheckOut)
          if (Number.isNaN(newCo.getTime())) {
            throw new HttpError('Format tanggal check-out tidak valid', 400)
          }

          const jumlahMalam = hitungJumlahMalam(existing.tanggalCheckIn, newCo)
          if (jumlahMalam <= 0) {
            throw new HttpError('Tanggal check-out baru harus setelah tanggal check-in', 400)
          }

          if (existing.roomId) {
            const conflict = await findRoomConflict(
              tx,
              existing.roomId,
              existing.tanggalCheckIn,
              newCo,
              existing.id
            )
            if (conflict) {
              throw new HttpError(
                `Perpanjangan bentrok dengan reservasi ${conflict.kodeBooking}`,
                409
              )
            }
          }

          const taxConfig = await getActiveTaxConfig(tx)
          const { taxResult } = computeReservationTotals(
            {
              tarifPerMalam: existing.tarifPerMalam,
              jumlahMalam,
              diskonPct: existing.diskonPct,
              diskonNominal: existing.diskonNominal,
              extraBed: existing.extraBed,
              biayaExtraBed: existing.biayaExtraBed,
              biayaTambahan: existing.biayaTambahan,
            },
            taxConfig
          )

          keterangan = `Memperpanjang menginap ${existing.kodeBooking} menjadi ${jumlahMalam} malam`
          return tx.reservation.update({
            where: { id },
            data: {
              tanggalCheckOut: newCo,
              jumlahMalam,
              totalTarif: taxResult.subtotal,
              totalPajak: taxResult.pajak,
              totalServiceCharge: taxResult.serviceCharge,
              totalKeseluruhan: taxResult.total,
            },
            include: {
              guest: true,
              room: { include: { roomType: true } },
              ratePlan: true,
              folio: true,
            },
          })
        }

        default:
          throw new HttpError(`Action tidak dikenal: ${action}`, 400)
      }
    })

    await createAuditLog({
      userId: auth.user.id,
      aksi: 'UPDATE',
      entitas: 'Reservation',
      entitasId: id,
      dataBefore,
      dataAfter: {
        status: updated.status,
        roomId: updated.roomId,
        tanggalCheckOut: updated.tanggalCheckOut,
        jumlahMalam: updated.jumlahMalam,
        totalKeseluruhan: updated.totalKeseluruhan,
      },
      keterangan,
    })

    return NextResponse.json({
      reservation: {
        ...updated,
        guest: maskGuestIdentity(updated.guest),
      },
    })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return handleApiError(err, 'PUT /api/reservasi/[id]')
  }
}
