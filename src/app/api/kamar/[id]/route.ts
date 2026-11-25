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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeApi('kamar.write')
    if (auth.error) return auth.error

    const { id } = await params
    const body = await request.json()

    if (body.type === 'roomType') {
      const existing = await prisma.roomType.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json(
          { error: 'Tipe kamar tidak ditemukan.' },
          { status: 404 }
        )
      }

      const updateData: {
        nama?: string
        kapasitas?: number
        fasilitas?: string | null
        deskripsi?: string | null
        aktif?: boolean
      } = {}

      if (body.nama !== undefined) {
        if (typeof body.nama !== 'string' || !body.nama.trim()) {
          return NextResponse.json(
            { error: 'Nama tipe kamar tidak boleh kosong.' },
            { status: 400 }
          )
        }
        updateData.nama = body.nama.trim()
      }

      if (body.kapasitas !== undefined) {
        const kapasitas = Number(body.kapasitas)
        if (!Number.isInteger(kapasitas) || kapasitas < 1) {
          return NextResponse.json(
            { error: 'Kapasitas kamar harus berupa bilangan bulat minimal 1.' },
            { status: 400 }
          )
        }
        updateData.kapasitas = kapasitas
      }

      if (body.fasilitas !== undefined) {
        updateData.fasilitas = serializeFasilitas(body.fasilitas)
      }

      if (body.deskripsi !== undefined) {
        updateData.deskripsi =
          typeof body.deskripsi === 'string' && body.deskripsi.trim()
            ? body.deskripsi.trim()
            : null
      }

      if (body.aktif !== undefined) {
        if (typeof body.aktif !== 'boolean') {
          return NextResponse.json(
            { error: 'Status aktif harus berupa boolean.' },
            { status: 400 }
          )
        }
        updateData.aktif = body.aktif
      }

      const updated = await prisma.roomType.update({
        where: { id },
        data: updateData,
      })

      await createAuditLog({
        userId: auth.user.id,
        aksi: 'UPDATE',
        entitas: 'RoomType',
        entitasId: updated.id,
        dataBefore: {
          nama: existing.nama,
          kapasitas: existing.kapasitas,
          fasilitas: existing.fasilitas,
          deskripsi: existing.deskripsi,
          aktif: existing.aktif,
        },
        dataAfter: {
          nama: updated.nama,
          kapasitas: updated.kapasitas,
          fasilitas: updated.fasilitas,
          deskripsi: updated.deskripsi,
          aktif: updated.aktif,
        },
        keterangan: `Memperbarui tipe kamar: ${updated.nama}`,
      })

      return NextResponse.json({ roomType: updated })
    }

    const existing = await prisma.room.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Kamar tidak ditemukan.' },
        { status: 404 }
      )
    }

    const updateData: {
      status?: string
      lantai?: number | null
      roomTypeId?: string
      aktif?: boolean
      catatan?: string | null
    } = {}

    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !VALID_ROOM_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: 'Status kamar tidak valid. Pilihan: TERSEDIA, TERISI, OUT_OF_ORDER, MAINTENANCE.' },
          { status: 400 }
        )
      }
      updateData.status = body.status
    }

    if (body.lantai !== undefined) {
      if (body.lantai === null || body.lantai === '') {
        updateData.lantai = null
      } else {
        const lantai = Number(body.lantai)
        if (!Number.isInteger(lantai)) {
          return NextResponse.json(
            { error: 'Lantai harus berupa bilangan bulat.' },
            { status: 400 }
          )
        }
        updateData.lantai = lantai
      }
    }

    if (body.roomTypeId !== undefined) {
      if (typeof body.roomTypeId !== 'string' || !body.roomTypeId.trim()) {
        return NextResponse.json(
          { error: 'Tipe kamar tidak valid.' },
          { status: 400 }
        )
      }
      const roomType = await prisma.roomType.findUnique({
        where: { id: body.roomTypeId.trim() },
      })
      if (!roomType) {
        return NextResponse.json(
          { error: 'Tipe kamar tidak ditemukan.' },
          { status: 404 }
        )
      }
      updateData.roomTypeId = roomType.id
    }

    if (body.aktif !== undefined) {
      if (typeof body.aktif !== 'boolean') {
        return NextResponse.json(
          { error: 'Status aktif harus berupa boolean.' },
          { status: 400 }
        )
      }
      updateData.aktif = body.aktif
    }

    if (body.catatan !== undefined) {
      updateData.catatan =
        typeof body.catatan === 'string' && body.catatan.trim()
          ? body.catatan.trim()
          : null
    }

    const updated = await prisma.room.update({
      where: { id },
      data: updateData,
      include: {
        roomType: true,
      },
    })

    await createAuditLog({
      userId: auth.user.id,
      aksi: 'UPDATE',
      entitas: 'Room',
      entitasId: updated.id,
      dataBefore: {
        status: existing.status,
        lantai: existing.lantai,
        roomTypeId: existing.roomTypeId,
        aktif: existing.aktif,
        catatan: existing.catatan,
      },
      dataAfter: {
        status: updated.status,
        lantai: updated.lantai,
        roomTypeId: updated.roomTypeId,
        aktif: updated.aktif,
        catatan: updated.catatan,
      },
      keterangan: `Memperbarui kamar nomor ${updated.nomor}`,
    })

    return NextResponse.json({ room: updated })
  } catch (err) {
    return handleApiError(err, 'PUT /api/kamar/[id]')
  }
}
