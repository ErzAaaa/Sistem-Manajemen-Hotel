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

export async function GET() {
  try {
    const auth = await authorizeApi('users.read')
    if (auth.error) return auth.error

    const users = await prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ users })
  } catch (err) {
    return handleApiError(err, 'GET /api/users')
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeApi('*')
    if (auth.error) return auth.error

    const body = await request.json()
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const nama = typeof body.nama === 'string' ? body.nama.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const role = typeof body.role === 'string' ? body.role : ''
    const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null

    if (!username || !nama || !password || !role) {
      return NextResponse.json(
        { error: 'Username, nama, password, dan role wajib diisi.' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password minimal 6 karakter.' },
        { status: 400 }
      )
    }

    if (!VALID_ROLES.includes(role as UserRole)) {
      return NextResponse.json(
        { error: 'Role tidak valid. Pilihan: OWNER, MANAJER, RESEPSIONIS, ADMIN_KEUANGAN.' },
        { status: 400 }
      )
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username },
    })
    if (existingUsername) {
      return NextResponse.json(
        { error: 'Username sudah digunakan.' },
        { status: 409 }
      )
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email },
      })
      if (existingEmail) {
        return NextResponse.json(
          { error: 'Email sudah digunakan.' },
          { status: 409 }
        )
      }
    }

    const passwordHash = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        nama,
        role,
        aktif: typeof body.aktif === 'boolean' ? body.aktif : true,
      },
      select: USER_SELECT,
    })

    await createAuditLog({
      userId: auth.user.id,
      aksi: 'CREATE',
      entitas: 'User',
      entitasId: user.id,
      dataAfter: {
        username: user.username,
        email: user.email,
        nama: user.nama,
        role: user.role,
        aktif: user.aktif,
      },
      keterangan: `Menambah pengguna baru: ${user.username} (${user.role})`,
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (err) {
    return handleApiError(err, 'POST /api/users')
  }
}
