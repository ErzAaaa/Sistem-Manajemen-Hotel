import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { hashPassword, UserRole } from '@/lib/auth'
import { createAuditLog } from '@/lib/audit'

const VALID_ROLES: UserRole[] = ['OWNER', 'MANAJER', 'RESEPSIONIS', 'ADMIN_KEUANGAN']

const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  nama: true,
  role: true,
  aktif: true,
  createdAt: true,
  updatedAt: true,
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeApi('*')
    if (auth.error) return auth.error

    const { id } = await params
    const existing = await prisma.user.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Pengguna tidak ditemukan.' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const updateData: {
      nama?: string
      role?: string
      aktif?: boolean
      email?: string | null
      passwordHash?: string
    } = {}

    if (body.nama !== undefined) {
      if (typeof body.nama !== 'string' || !body.nama.trim()) {
        return NextResponse.json(
          { error: 'Nama tidak boleh kosong.' },
          { status: 400 }
        )
      }
      updateData.nama = body.nama.trim()
    }

    if (body.role !== undefined) {
      if (typeof body.role !== 'string' || !VALID_ROLES.includes(body.role as UserRole)) {
        return NextResponse.json(
          { error: 'Role tidak valid. Pilihan: OWNER, MANAJER, RESEPSIONIS, ADMIN_KEUANGAN.' },
          { status: 400 }
        )
      }
      updateData.role = body.role
    }

    if (body.aktif !== undefined) {
      if (typeof body.aktif !== 'boolean') {
        return NextResponse.json(
          { error: 'Status aktif harus berupa boolean.' },
          { status: 400 }
        )
      }
      if (id === auth.user.id && body.aktif === false) {
        return NextResponse.json(
          { error: 'Tidak dapat menonaktifkan akun Anda sendiri.' },
          { status: 400 }
        )
      }
      updateData.aktif = body.aktif
    }

    if (body.email !== undefined) {
      const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null
      if (email && email !== existing.email) {
        const duplicateEmail = await prisma.user.findUnique({ where: { email } })
        if (duplicateEmail) {
          return NextResponse.json(
            { error: 'Email sudah digunakan.' },
            { status: 409 }
          )
        }
      }
      updateData.email = email
    }

    let passwordChanged = false
    if (typeof body.password === 'string' && body.password.length > 0) {
      if (body.password.length < 6) {
        return NextResponse.json(
          { error: 'Password minimal 6 karakter.' },
          { status: 400 }
        )
      }
      updateData.passwordHash = await hashPassword(body.password)
      passwordChanged = true
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: USER_SELECT,
    })

    await createAuditLog({
      userId: auth.user.id,
      aksi: 'UPDATE',
      entitas: 'User',
      entitasId: updated.id,
      dataBefore: {
        nama: existing.nama,
        email: existing.email,
        role: existing.role,
        aktif: existing.aktif,
      },
      dataAfter: {
        nama: updated.nama,
        email: updated.email,
        role: updated.role,
        aktif: updated.aktif,
        passwordChanged,
      },
      keterangan: `Memperbarui pengguna: ${updated.username}`,
    })

    return NextResponse.json({ user: updated })
  } catch (err) {
    return handleApiError(err, 'PUT /api/users/[id]')
  }
}
