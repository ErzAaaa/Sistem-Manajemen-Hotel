import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { maskGuestIdentity } from '@/lib/reservasi-folio'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeApi('folio.read')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const folio = await prisma.folio.findUnique({
      where: { id },
      include: {
        reservation: {
          include: {
            guest: true,
            room: { include: { roomType: true } },
            ratePlan: true,
          },
        },
        charges: {
          orderBy: { createdAt: 'asc' },
        },
        payments: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!folio) {
      return NextResponse.json({ error: 'Folio tidak ditemukan' }, { status: 404 })
    }

    return NextResponse.json({
      folio: {
        ...folio,
        reservation: folio.reservation
          ? {
              ...folio.reservation,
              guest: maskGuestIdentity(folio.reservation.guest),
            }
          : null,
      },
    })
  } catch (err) {
    return handleApiError(err, 'GET /api/folio/[id]')
  }
}
