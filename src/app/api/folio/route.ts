import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { maskGuestIdentity } from '@/lib/reservasi-folio'

export async function GET(request: NextRequest) {
  const auth = await authorizeApi('folio.read')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const folios = await prisma.folio.findMany({
      where: status ? { status } : undefined,
      include: {
        reservation: {
          include: {
            guest: true,
            room: { include: { roomType: true } },
          },
        },
        charges: {
          where: { isVoid: false },
          orderBy: { createdAt: 'asc' },
        },
        payments: {
          where: { isVoid: false },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const sanitized = folios.map((folio) => ({
      ...folio,
      reservation: folio.reservation
        ? {
            ...folio.reservation,
            guest: maskGuestIdentity(folio.reservation.guest),
          }
        : null,
    }))

    return NextResponse.json({ folios: sanitized })
  } catch (err) {
    return handleApiError(err, 'GET /api/folio')
  }
}
