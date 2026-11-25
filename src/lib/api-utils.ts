import { NextResponse } from 'next/server'
import { getCurrentUser, hasPermission, AuthUser } from './auth'

export async function authorizeApi(permission?: string): Promise<
  { user: AuthUser; error: null } | { user: null; error: NextResponse }
> {
  const user = await getCurrentUser()
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Tidak terautentikasi. Silakan login.' }, { status: 401 }),
    }
  }
  if (permission && !hasPermission(user.role, permission)) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Akses ditolak untuk peran Anda.' }, { status: 403 }),
    }
  }
  return { user, error: null }
}

export function handleApiError(err: unknown, context: string) {
  console.error(`[API Error] ${context}:`, err)
  const message = err instanceof Error ? err.message : 'Terjadi kesalahan server'
  return NextResponse.json({ error: message }, { status: 500 })
}
