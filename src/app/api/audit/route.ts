import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeApi('audit.read')
    if (auth.error) return auth.error

    const { searchParams } = request.nextUrl
    const entitas = searchParams.get('entitas')?.trim()
    const aksi = searchParams.get('aksi')?.trim()

    const where: { entitas?: string; aksi?: string } = {}
    if (entitas) where.entitas = entitas
    if (aksi) where.aksi = aksi

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            nama: true,
            username: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ logs })
  } catch (err) {
    return handleApiError(err, 'GET /api/audit')
  }
}
