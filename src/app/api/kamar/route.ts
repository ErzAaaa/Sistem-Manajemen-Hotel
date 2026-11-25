import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'

const VALID_ROOM_STATUSES = ['TERSEDIA', 'TERISI', 'OUT_OF_ORDER', 'MAINTENANCE']

function serializeFasilitas(fasilitas: unknown): string | null {
  if (fasilitas === undefined || fasilitas === null) return null
  if (Array.isArray(fasilitas)) return JSON.stringify(fasilitas)
  if (typeof fasilitas === 'string') {
    const trimmed = fasilitas.trim()
    return trimmed ? trimmed : null
  }
  return null
}

export async function GET() {
  try {
    const auth = await authorizeApi('kamar.read')
    if (auth.error) return auth.error

    const [roomTypes, rooms] = await Promise.all([
      prisma.roomType.findMany({
        include: {
          _count: {
            select: { rooms: true },
          },
        },
        orderBy: { nama: 'asc' },
      }),
      prisma.room.findMany({
        include: {
          roomType: true,
        },
        orderBy: { nomor: 'asc' },
      }),
    ])

    const activeRooms = rooms.filter((r) => r.aktif)
    const total = rooms.length
    const tersedia = activeRooms.filter((r) => r.status === 'TERSEDIA').length
    const terisi = activeRooms.filter((r) => r.status === 'TERISI').length
    const outOfOrder = activeRooms.filter(
      (r) => r.status === 'OUT_OF_ORDER' || r.status === 'MAINTENANCE'
    ).length
    const kamarTersedia = activeRooms.filter(
      (r) => r.status !== 'OUT_OF_ORDER' && r.status !== 'MAINTENANCE'
    ).length

    return NextResponse.json({
      roomTypes,
      rooms,
      summary: {
        total,
        tersedia,
        terisi,
        outOfOrder,
        kamarTersedia,
      },
    })
  } catch (err) {
    return handleApiError(err, 'GET /api/kamar')
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeApi('kamar.write')
    if (auth.error) return auth.error

    const body = await request.json()

    if (body.type === 'roomType') {
      const nama = typeof body.nama === 'string' ? body.nama.trim() : ''
      if (!nama) {
        return NextResponse.json(
          { error: 'Nama tipe kamar wajib diisi.' },
          { status: 400 }
        )
      }

      const kapasitas = body.kapasitas !== undefined ? Number(body.kapasitas) : 2
      if (!Number.isInteger(kapasitas) || kapasitas < 1) {
        return NextResponse.json(
          { error: 'Kapasitas kamar harus berupa bilangan bulat minimal 1.' },
          { status: 400 }
        )
      }

      const roomType = await prisma.roomType.create({
        data: {
          nama,
          kapasitas,
          fasilitas: serializeFasilitas(body.fasilitas),
          deskripsi: typeof body.deskripsi === 'string' && body.deskripsi.trim()
            ? body.deskripsi.trim()
            : null,
          aktif: typeof body.aktif === 'boolean' ? body.aktif : true,
        },
      })

      await createAuditLog({
        userId: auth.user.id,
        aksi: 'CREATE',
        entitas: 'RoomType',
        entitasId: roomType.id,
        dataAfter: {
          nama: roomType.nama,
          kapasitas: roomType.kapasitas,
          fasilitas: roomType.fasilitas,
          deskripsi: roomType.deskripsi,
          aktif: roomType.aktif,
        },
        keterangan: `Menambah tipe kamar: ${roomType.nama}`,
      })

      return NextResponse.json({ roomType }, { status: 201 })
    }

    const nomor = typeof body.nomor === 'string' ? body.nomor.trim() : ''
    const roomTypeId = typeof body.roomTypeId === 'string' ? body.roomTypeId.trim() : ''
    const lantai =
      body.lantai !== undefined && body.lantai !== null && body.lantai !== ''
        ? Number(body.lantai)
        : null
    const status = typeof body.status === 'string' ? body.status : 'TERSEDIA'
    const catatan =
      typeof body.catatan === 'string' && body.catatan.trim()
        ? body.catatan.trim()
        : null

    if (!nomor || !roomTypeId) {
      return NextResponse.json(
        { error: 'Nomor kamar dan tipe kamar wajib diisi.' },
        { status: 400 }
      )
    }

    if (lantai !== null && !Number.isInteger(lantai)) {
      return NextResponse.json(
        { error: 'Lantai harus berupa bilangan bulat.' },
        { status: 400 }
      )
    }

    if (!VALID_ROOM_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'Status kamar tidak valid.' },
        { status: 400 }
      )
    }

    const [existingRoom, roomType] = await Promise.all([
      prisma.room.findUnique({ where: { nomor } }),
      prisma.roomType.findUnique({ where: { id: roomTypeId } }),
    ])

    if (existingRoom) {
      return NextResponse.json(
        { error: `Nomor kamar ${nomor} sudah terdaftar.` },
        { status: 409 }
      )
    }

    if (!roomType) {
      return NextResponse.json(
        { error: 'Tipe kamar tidak ditemukan.' },
        { status: 404 }
      )
    }

    const room = await prisma.room.create({
      data: {
        nomor,
        lantai,
        roomTypeId,
        status,
        catatan,
        aktif: typeof body.aktif === 'boolean' ? body.aktif : true,
      },
      include: {
        roomType: true,
      },
    })

    await createAuditLog({
      userId: auth.user.id,
      aksi: 'CREATE',
      entitas: 'Room',
      entitasId: room.id,
      dataAfter: {
        nomor: room.nomor,
        lantai: room.lantai,
        roomTypeId: room.roomTypeId,
        status: room.status,
        catatan: room.catatan,
      },
      keterangan: `Menambah kamar nomor ${room.nomor} (${roomType.nama})`,
    })

    return NextResponse.json({ room }, { status: 201 })
  } catch (err) {
    return handleApiError(err, 'POST /api/kamar')
  }
}
