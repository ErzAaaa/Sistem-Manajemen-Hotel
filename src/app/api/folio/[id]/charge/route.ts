import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { calculateTaxAndService } from '@/lib/calculations'
import { HttpError, getActiveTaxConfig, recalculateFolio } from '@/lib/reservasi-folio'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeApi('folio.write')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json()
    const { kategori, deskripsi, nominal, tanggal } = body

    if (!kategori || !deskripsi || !String(deskripsi).trim()) {
      return NextResponse.json(
        { error: 'Kategori dan deskripsi biaya wajib diisi' },
        { status: 400 }
      )
    }

    const numericNominal = Number(nominal)
    if (!Number.isFinite(numericNominal) || numericNominal <= 0) {
      return NextResponse.json(
        { error: 'Nominal biaya harus lebih dari 0' },
        { status: 400 }
      )
    }

    const chargeDate = tanggal ? new Date(tanggal) : new Date()
    if (Number.isNaN(chargeDate.getTime())) {
      return NextResponse.json({ error: 'Format tanggal tidak valid' }, { status: 400 })
    }

    const folio = await prisma.folio.findUnique({ where: { id } })
    if (!folio) {
      return NextResponse.json({ error: 'Folio tidak ditemukan' }, { status: 404 })
    }
    if (folio.status !== 'OPEN') {
      return NextResponse.json(
        { error: `Tidak dapat menambah biaya pada folio berstatus ${folio.status}` },
        { status: 400 }
      )
    }

    const taxConfig = await getActiveTaxConfig(prisma)
    const taxResult = calculateTaxAndService({
      baseAmount: numericNominal,
      pajakDaerahPct: taxConfig.pajakDaerahPct,
      serviceChargePct: taxConfig.serviceChargePct,
      modeHarga: taxConfig.modeHarga,
    })

    const result = await prisma.$transaction(async (tx) => {
      const charge = await tx.folioCharge.create({
        data: {
          folioId: id,
          tanggal: chargeDate,
          kategori: String(kategori).trim(),
          deskripsi: String(deskripsi).trim(),
          nominal: taxResult.subtotal,
          pajak: taxResult.pajak,
          serviceCharge: taxResult.serviceCharge,
          total: taxResult.total,
          createdById: auth.user.id,
        },
      })

      const updatedFolio = await recalculateFolio(tx, id)
      return { charge, folio: updatedFolio }
    })

    await createAuditLog({
      userId: auth.user.id,
      aksi: 'CREATE',
      entitas: 'FolioCharge',
      entitasId: result.charge.id,
      dataAfter: {
        folioId: id,
        kategori: result.charge.kategori,
        deskripsi: result.charge.deskripsi,
        nominal: result.charge.nominal,
        pajak: result.charge.pajak,
        serviceCharge: result.charge.serviceCharge,
        total: result.charge.total,
      },
      keterangan: `Menambah biaya ${result.charge.kategori}: ${result.charge.deskripsi}`,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return handleApiError(err, 'POST /api/folio/[id]/charge')
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeApi('folio.void')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json()
    const { chargeId, alasanVoid } = body

    if (!chargeId || !alasanVoid || !String(alasanVoid).trim()) {
      return NextResponse.json(
        { error: 'chargeId dan alasanVoid wajib diisi' },
        { status: 400 }
      )
    }

    const trimmedReason = String(alasanVoid).trim()

    const result = await prisma.$transaction(async (tx) => {
      const existingCharge = await tx.folioCharge.findFirst({
        where: { id: chargeId, folioId: id },
      })

      if (!existingCharge) {
        throw new HttpError('Item biaya folio tidak ditemukan', 404)
      }
      if (existingCharge.isVoid) {
        throw new HttpError('Item biaya sudah di-void sebelumnya', 400)
      }

      const updatedCharge = await tx.folioCharge.update({
        where: { id: chargeId },
        data: {
          isVoid: true,
          alasanVoid: trimmedReason,
          voidAt: new Date(),
        },
      })

      const updatedFolio = await recalculateFolio(tx, id)
      return { existingCharge, charge: updatedCharge, folio: updatedFolio }
    })

    await createAuditLog({
      userId: auth.user.id,
      aksi: 'VOID',
      entitas: 'FolioCharge',
      entitasId: result.charge.id,
      dataBefore: {
        isVoid: result.existingCharge.isVoid,
        total: result.existingCharge.total,
      },
      dataAfter: {
        isVoid: result.charge.isVoid,
        alasanVoid: result.charge.alasanVoid,
        voidAt: result.charge.voidAt,
      },
      keterangan: `Void biaya folio (${result.existingCharge.deskripsi}): ${trimmedReason}`,
    })

    return NextResponse.json({ charge: result.charge, folio: result.folio })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return handleApiError(err, 'PUT /api/folio/[id]/charge')
  }
}
