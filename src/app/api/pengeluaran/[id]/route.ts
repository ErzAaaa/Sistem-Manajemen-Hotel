import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'

const USER_PUBLIC_SELECT = {
  id: true,
  nama: true,
  username: true,
  role: true,
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await authorizeApi('pengeluaran.approve')
  if (error) return error

  try {
    const { id } = await params
    const body = await request.json()
    const { statusApproval } = body

    if (statusApproval !== 'APPROVED' && statusApproval !== 'REJECTED') {
      return NextResponse.json(
        { error: 'statusApproval harus APPROVED atau REJECTED' },
        { status: 400 }
      )
    }

    const existing = await prisma.expense.findUnique({
      where: { id },
      include: { category: true },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Pengeluaran tidak ditemukan' },
        { status: 404 }
      )
    }

    if (existing.statusApproval !== 'PENDING') {
      return NextResponse.json(
        { error: `Pengeluaran sudah berstatus ${existing.statusApproval}` },
        { status: 400 }
      )
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        statusApproval,
        approvedById: user.id,
      },
      include: {
        category: true,
        createdBy: { select: USER_PUBLIC_SELECT },
        approvedBy: { select: USER_PUBLIC_SELECT },
      },
    })

    await createAuditLog({
      userId: user.id,
      aksi: statusApproval === 'APPROVED' ? 'APPROVE' : 'REJECT',
      entitas: 'Expense',
      entitasId: id,
      dataBefore: {
        statusApproval: existing.statusApproval,
        approvedById: existing.approvedById,
      },
      dataAfter: {
        statusApproval: expense.statusApproval,
        approvedById: user.id,
      },
      keterangan: `${
        statusApproval === 'APPROVED' ? 'Menyetujui' : 'Menolak'
      } pengeluaran ${existing.category.nama} sebesar Rp ${existing.nominal}`,
    })

    return NextResponse.json({ expense })
  } catch (err) {
    return handleApiError(err, 'PUT /api/pengeluaran/[id]')
  }
}
