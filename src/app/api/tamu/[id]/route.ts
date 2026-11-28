import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { encryptText, decryptText } from '@/lib/crypto'
import { maskIdentitas } from '@/lib/format'
import { validateGuestAddress } from '@/lib/guest-validation'

type RouteContext = { params: Promise<{ id: string }> }

function maskGuestIdentitas<T extends { nomorIdentitas: string | null }>(guest: T): T {
  return {
    ...guest,
    nomorIdentitas: guest.nomorIdentitas
      ? maskIdentitas(decryptText(guest.nomorIdentitas))
      : null,
  }
}

function sanitizeGuestForAudit(guest: {
  nama: string
  telepon: string | null
  email: string | null
  jenisIdentitas: string | null
  nomorIdentitas: string | null
  kewarganegaraan: string
  kotaAsal: string | null
  alamat: string | null
  flagVip: boolean
  flagBlacklist: boolean
  catatan: string | null
  persetujuanPrivasi: boolean
}) {
  return {
    nama: guest.nama,
    telepon: guest.telepon,
    email: guest.email,
    jenisIdentitas: guest.jenisIdentitas,
    nomorIdentitas: guest.nomorIdentitas
      ? maskIdentitas(decryptText(guest.nomorIdentitas))
      : null,
    kewarganegaraan: guest.kewarganegaraan,
    kotaAsal: guest.kotaAsal,
    alamat: guest.alamat,
    flagVip: guest.flagVip,
    flagBlacklist: guest.flagBlacklist,
    catatan: guest.catatan,
    persetujuanPrivasi: guest.persetujuanPrivasi,
  }
}

function toOptionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { error } = await authorizeApi('tamu.read')
    if (error) return error

    const { id } = await params
    const guest = await prisma.guest.findUnique({
      where: { id },
      include: {
        reservations: {
          include: {
            room: true,
            ratePlan: true,
          },
          orderBy: { tanggalCheckIn: 'desc' },
        },
        _count: {
          select: { reservations: true },
        },
      },
    })

    if (!guest) {
      return NextResponse.json({ error: 'Tamu tidak ditemukan' }, { status: 404 })
    }

    return NextResponse.json({ guest: maskGuestIdentitas(guest) })
  } catch (err) {
    return handleApiError(err, 'GET /api/tamu/[id]')
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { user, error } = await authorizeApi('tamu.write')
    if (error) return error

    const { id } = await params
    const existing = await prisma.guest.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Tamu tidak ditemukan' }, { status: 404 })
    }

    const body = await request.json()
    const {
      nama,
      telepon,
      email,
      jenisIdentitas,
      nomorIdentitas,
      kewarganegaraan,
      kotaAsal,
      alamat,
      flagVip,
      flagBlacklist,
      catatan,
      persetujuanPrivasi,
    } = body

    const updateData: {
      nama?: string
      telepon?: string | null
      email?: string | null
      jenisIdentitas?: string | null
      nomorIdentitas?: string | null
      kewarganegaraan?: string
      kotaAsal?: string | null
      alamat?: string | null
      flagVip?: boolean
      flagBlacklist?: boolean
      catatan?: string | null
      persetujuanPrivasi?: boolean
    } = {}

    if (nama !== undefined) {
      if (typeof nama !== 'string' || !nama.trim()) {
        return NextResponse.json({ error: 'Nama tamu tidak boleh kosong' }, { status: 400 })
      }
      updateData.nama = nama.trim()
    }

    if (telepon !== undefined) updateData.telepon = toOptionalTrimmedString(telepon)
    if (email !== undefined) updateData.email = toOptionalTrimmedString(email)
    if (jenisIdentitas !== undefined) updateData.jenisIdentitas = toOptionalTrimmedString(jenisIdentitas)
    if (kewarganegaraan !== undefined) {
      updateData.kewarganegaraan = toOptionalTrimmedString(kewarganegaraan) ?? 'WNI'
    }
    if (kotaAsal !== undefined) updateData.kotaAsal = toOptionalTrimmedString(kotaAsal)
    if (alamat !== undefined) {
      const addressCheck = validateGuestAddress(alamat, { required: false })
      if (!addressCheck.valid) {
        return NextResponse.json({ error: addressCheck.error }, { status: 400 })
      }
      updateData.alamat = addressCheck.value
    }
    if (flagVip !== undefined) updateData.flagVip = Boolean(flagVip)
    if (flagBlacklist !== undefined) updateData.flagBlacklist = Boolean(flagBlacklist)
    if (catatan !== undefined) updateData.catatan = toOptionalTrimmedString(catatan)
    if (persetujuanPrivasi !== undefined) updateData.persetujuanPrivasi = Boolean(persetujuanPrivasi)

    if (nomorIdentitas !== undefined) {
      if (nomorIdentitas === null) {
        updateData.nomorIdentitas = null
      } else if (typeof nomorIdentitas === 'string') {
        const trimmed = nomorIdentitas.trim()
        if (trimmed === '') {
          updateData.nomorIdentitas = null
        } else if (!trimmed.startsWith('****')) {
          updateData.nomorIdentitas = encryptText(trimmed)
        }
      }
    }

    const guest = await prisma.guest.update({
      where: { id },
      data: updateData,
      include: {
        reservations: {
          include: {
            room: true,
            ratePlan: true,
          },
          orderBy: { tanggalCheckIn: 'desc' },
        },
        _count: {
          select: { reservations: true },
        },
      },
    })

    await createAuditLog({
      userId: user.id,
      aksi: 'UPDATE',
      entitas: 'Guest',
      entitasId: id,
      dataBefore: sanitizeGuestForAudit(existing),
      dataAfter: sanitizeGuestForAudit(guest),
      keterangan: `Memperbarui data tamu: ${guest.nama}`,
    })

    return NextResponse.json({ guest: maskGuestIdentitas(guest) })
  } catch (err) {
    return handleApiError(err, 'PUT /api/tamu/[id]')
  }
}
