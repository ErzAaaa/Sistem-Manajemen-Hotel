import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { encryptText, decryptText } from '@/lib/crypto'
import { maskIdentitas } from '@/lib/format'
import { validateGuestAddress } from '@/lib/guest-validation'

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

export async function GET(request: NextRequest) {
  try {
    const { error } = await authorizeApi('tamu.read')
    if (error) return error

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim() || ''
    const kewarganegaraan = searchParams.get('kewarganegaraan')?.trim() || ''

    const where: Prisma.GuestWhereInput = {}

    if (q) {
      where.OR = [
        { nama: { contains: q } },
        { telepon: { contains: q } },
        { email: { contains: q } },
        { kotaAsal: { contains: q } },
        { alamat: { contains: q } },
      ]
    }

    if (kewarganegaraan) {
      where.kewarganegaraan = kewarganegaraan
    }

    const rawGuests = await prisma.guest.findMany({
      where,
      include: {
        _count: {
          select: { reservations: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const guests = rawGuests.map(maskGuestIdentitas)
    return NextResponse.json({ guests })
  } catch (err) {
    return handleApiError(err, 'GET /api/tamu')
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await authorizeApi('tamu.write')
    if (error) return error

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
      forceCreate,
    } = body

    if (!nama || typeof nama !== 'string' || !nama.trim()) {
      return NextResponse.json({ error: 'Nama tamu wajib diisi' }, { status: 400 })
    }

    const trimmedNama = nama.trim()
    const trimmedTelepon = toOptionalTrimmedString(telepon)

    if (!forceCreate && trimmedTelepon) {
      const candidates = await prisma.guest.findMany({
        where: { telepon: trimmedTelepon },
        include: {
          _count: {
            select: { reservations: true },
          },
        },
      })

      const duplicate = candidates.find(
        (g) => g.nama.trim().toLowerCase() === trimmedNama.toLowerCase()
      )

      if (duplicate) {
        return NextResponse.json(
          {
            error: 'Potensi tamu duplikat ditemukan',
            duplicate: maskGuestIdentitas(duplicate),
          },
          { status: 409 }
        )
      }
    }

    const addressCheck = validateGuestAddress(alamat, { required: false })
    if (!addressCheck.valid) {
      return NextResponse.json({ error: addressCheck.error }, { status: 400 })
    }

    const rawIdentitas = toOptionalTrimmedString(nomorIdentitas)
    const encryptedIdentitas = rawIdentitas ? encryptText(rawIdentitas) : null

    const guest = await prisma.guest.create({
      data: {
        nama: trimmedNama,
        telepon: trimmedTelepon,
        email: toOptionalTrimmedString(email),
        jenisIdentitas: toOptionalTrimmedString(jenisIdentitas),
        nomorIdentitas: encryptedIdentitas,
        kewarganegaraan: toOptionalTrimmedString(kewarganegaraan) ?? 'WNI',
        kotaAsal: toOptionalTrimmedString(kotaAsal),
        alamat: addressCheck.value,
        flagVip: Boolean(flagVip),
        flagBlacklist: Boolean(flagBlacklist),
        catatan: toOptionalTrimmedString(catatan),
        persetujuanPrivasi: Boolean(persetujuanPrivasi),
      },
      include: {
        _count: {
          select: { reservations: true },
        },
      },
    })

    await createAuditLog({
      userId: user.id,
      aksi: 'CREATE',
      entitas: 'Guest',
      entitasId: guest.id,
      dataAfter: sanitizeGuestForAudit(guest),
      keterangan: `Menambahkan data tamu: ${guest.nama}`,
    })

    return NextResponse.json({ guest: maskGuestIdentitas(guest) }, { status: 201 })
  } catch (err) {
    return handleApiError(err, 'POST /api/tamu')
  }
}
