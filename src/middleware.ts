import { NextRequest, NextResponse } from 'next/server'

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'hotel-management-secret'

// Routes yang bisa diakses tanpa login
const PUBLIC_ROUTES = ['/login', '/api/auth/login']

// Routes yang hanya bisa diakses role tertentu
const ROLE_RESTRICTED: Record<string, string[]> = {
  '/laporan': ['OWNER', 'MANAJER', 'ADMIN_KEUANGAN'],
  '/users': ['OWNER', 'MANAJER'],
  '/properti': ['OWNER', 'MANAJER'],
  '/api/laporan': ['OWNER', 'MANAJER', 'ADMIN_KEUANGAN'],
  '/api/users': ['OWNER', 'MANAJER'],
}

interface JwtPayload {
  id: string
  username: string
  role: string
  exp?: number
}

function base64UrlToUint8Array(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4))
  const binary = atob(base64 + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function verifyJwtHS256(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, signatureB64] = parts
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const signatureBytes = base64UrlToUint8Array(signatureB64)
    const dataBytes = encoder.encode(`${headerB64}.${payloadB64}`)
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes.buffer as ArrayBuffer,
      dataBytes
    )
    if (!isValid) return null

    const payloadJson = new TextDecoder().decode(base64UrlToUint8Array(payloadB64))
    const payload = JSON.parse(payloadJson) as JwtPayload
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Allow static files & Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Get auth token from cookie
  const token = request.cookies.get('auth-token')?.value

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Verify JWT (Edge-compatible Web Crypto HS256)
  const user = await verifyJwtHS256(token, JWT_SECRET)
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Token tidak valid' }, { status: 401 })
    }
    const response = NextResponse.redirect(new URL('/login', request.url))
    response.cookies.delete('auth-token')
    return response
  }

  // Check role restrictions
  for (const [route, allowedRoles] of Object.entries(ROLE_RESTRICTED)) {
    if (pathname.startsWith(route)) {
      if (!allowedRoles.includes(user.role)) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
        }
        const fallback = user.role === 'RESEPSIONIS' ? '/reservasi' : '/pengeluaran'
        return NextResponse.redirect(new URL(fallback, request.url))
      }
      break
    }
  }

  // Inject user info to request headers for downstream use
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', user.id)
  requestHeaders.set('x-user-role', user.role)
  requestHeaders.set('x-user-username', user.username)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
