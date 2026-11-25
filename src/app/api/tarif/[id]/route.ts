import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'

type RouteContext = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const { user, error } = await authorizeApi('tarif.write')
    if (error) return error

    const { id } = await params
    const existing = await prisma.ratePlan.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Rate plan tidak ditemukan' }, { status: 404 })
    }

    const body = await request.json()
    const { nama, tarifDasar, sumber, inklusi, aktif } = body

    const updateData: {
      nama?: string
      tarifDasar?: number
      sumber?: string
      inklusi?: string | null
      aktif?: boolean
    } = {}

    if (nama !== undefined) {
      if (typeof nama !== 'string' || !nama.trim()) {
        return NextResponse.json({ error: 'Nama rate plan tidak boleh kosong' }, { status: 400 })
      }
      updateData.nama = nama.trim()
    }

    if (tarifDasar !== undefined) {
      const parsedTarif = Number(tarifDasar)
      if (Number.isNaN(parsedTarif) || parsedTarif < 0) {
        return NextResponse.json(
          { error: 'Tarif dasar harus berupa angka tidak negatif' },
          { status: 400 }
        )
      }
      updateData.tarifDasar = Math.round(parsedTarif)
    }

    if (sumber !== undefined) {
      if (typeof sumber !== 'string' || !sumber.trim()) {
        return NextResponse.json({ error: 'Sumber tarif tidak valid' }, { status: 400 })
      }
      updateData.sumber = sumber.trim()
    }

    if (inklusi !== undefined) {
      if (Array.isArray(inklusi)) {
        updateData.inklusi = JSON.stringify(inklusi)
      } else if (inklusi === null) {
        updateData.inklusi = null
      } else if (typeof inklusi === 'string') {
        updateData.inklusi = inklusi.trim() || null
      }
    }

    if (aktif !== undefined) {
      updateData.aktif = Boolean(aktif)
    }

    const ratePlan = await prisma.ratePlan.update({
      where: { id },
      data: updateData,
      include: {
        roomType: true,
        rateCalendars: {
          where: { aktif: true },
          orderBy: { tanggal: 'asc' },
        },
      },
    })

    await createAuditLog({
      userId: user.id,
      aksi: 'UPDATE',
      entitas: 'RatePlan',
      entitasId: id,
      dataBefore: {
        nama: existing.nama,
        tarifDasar: existing.tarifDasar,
        sumber: existing.sumber,
        inklusi: existing.inklusi,
        aktif: existing.aktif,
      },
      dataAfter: {
        nama: ratePlan.nama,
        tarifDasar: ratePlan.tarifDasar,
        sumber: ratePlan.sumber,
        inklusi: ratePlan.inklusi,
        aktif: ratePlan.aktif,
      },
      keterangan: `Memperbarui rate plan: ${ratePlan.nama}`,
    })

    return NextResponse.json({ ratePlan })
  } catch (err) {
    return handleApiError(err, 'PUT /api/tarif/[id]')
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { user, error } = await authorizeApi('tarif.write')
    if (error) return error

    const { id } = await params
    const existing = await prisma.ratePlan.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Rate plan tidak ditemukan' }, { status: 404 })
    }

    const ratePlan = await prisma.ratePlan.update({
      where: { id },
      data: { aktif: false },
    })

    await createAuditLog({
      userId: user.id,
      aksi: 'DELETE',
      entitas: 'RatePlan',
      entitasId: id,
      dataBefore: {
        nama: existing.nama,
        aktif: existing.aktif,
      },
      dataAfter: {
        nama: ratePlan.nama,
        aktif: ratePlan.aktif,
      },
      keterangan: `Menonaktifkan rate plan: ${existing.nama}`,
    })

    return NextResponse.json({ ratePlan, message: 'Rate plan berhasil dinonaktifkan' })
  } catch (err) {
    return handleApiError(err, 'DELETE /api/tarif/[id]')
  }
}
