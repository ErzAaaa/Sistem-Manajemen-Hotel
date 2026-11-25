import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'hotel-management-secret'

export type UserRole = 'OWNER' | 'MANAJER' | 'RESEPSIONIS' | 'ADMIN_KEUANGAN'

export interface AuthUser {
  id: string
  username: string
  nama: string
  role: UserRole
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, username: user.username, nama: user.nama, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  )
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser
  } catch {
    return null
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth-token')?.value
    if (!token) return null
    return verifyToken(token)
  } catch {
    return null
  }
}

export async function requireAuth(requiredRoles?: UserRole[]): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  if (requiredRoles && !requiredRoles.includes(user.role)) {
    throw new Error('Forbidden')
  }
  return user
}

// Permission map per role
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  OWNER: ['*'], // All access
  MANAJER: [
    'properti.read', 'properti.write',
    'kamar.read', 'kamar.write',
    'tarif.read', 'tarif.write', 'tarif.approve',
    'tamu.read', 'tamu.write',
    'reservasi.read', 'reservasi.write',
    'folio.read', 'folio.write', 'folio.void',
    'pengeluaran.read', 'pengeluaran.write', 'pengeluaran.approve',
    'laporan.read', 'laporan.laba',
    'tutup-hari.read', 'tutup-hari.write', 'tutup-hari.reopen',
    'users.read',
    'audit.read',
  ],
  RESEPSIONIS: [
    'kamar.read',
    'tarif.read',
    'tamu.read', 'tamu.write',
    'reservasi.read', 'reservasi.write',
    'folio.read', 'folio.write',
    'pengeluaran.read',
  ],
  ADMIN_KEUANGAN: [
    'kamar.read',
    'tarif.read',
    'tamu.read',
    'reservasi.read',
    'folio.read',
    'pengeluaran.read', 'pengeluaran.write',
    'laporan.read', 'laporan.laba',
    'tutup-hari.read',
    'audit.read',
  ],
}

export function hasPermission(role: UserRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role]
  if (perms.includes('*')) return true
  return perms.includes(permission)
}
