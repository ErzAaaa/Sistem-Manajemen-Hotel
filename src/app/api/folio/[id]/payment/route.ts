import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { HttpError, recalculateFolio } from '@/lib/reservasi-folio'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeApi('folio.write')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json()
    const { metode, nominal, keterangan, nomorReferensi, tanggal } = body

    if (!metode || !String(metode).trim()) {
      return NextResponse.json(
        { error: 'Metode pembayaran wajib diisi' },
        { status: 400 }
      )
    }

    const numericNominal = Math.round(Number(nominal))
    if (!Number.isFinite(numericNominal) || numericNominal <= 0) {
      return NextResponse.json(
        { error: 'Nominal pembayaran harus lebih dari 0' },
        { status: 400 }
      )
    }

    const paymentDate = tanggal ? new Date(tanggal) : new Date()
    if (Number.isNaN(paymentDate.getTime())) {
      return NextResponse.json({ error: 'Format tanggal tidak valid' }, { status: 400 })
    }

    const folio = await prisma.folio.findUnique({ where: { id } })
    if (!folio) {
      return NextResponse.json({ error: 'Folio tidak ditemukan' }, { status: 404 })
    }
    if (folio.status !== 'OPEN') {
      return NextResponse.json(
        { error: `Tidak dapat mencatat pembayaran pada folio berstatus ${folio.status}` },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          folioId: id,
          tanggal: paymentDate,
          metode: String(metode).trim(),
          nominal: numericNominal,
          keterangan: keterangan ? String(keterangan).trim() : null,
          nomorReferensi: nomorReferensi ? String(nomorReferensi).trim() : null,
          createdById: auth.user.id,
        },
      })

      const updatedFolio = await recalculateFolio(tx, id)
      return { payment, folio: updatedFolio }
    })

    await createAuditLog({
      userId: auth.user.id,
      aksi: 'CREATE',
      entitas: 'Payment',
      entitasId: result.payment.id,
      dataAfter: {
        folioId: id,
        metode: result.payment.metode,
        nominal: result.payment.nominal,
        nomorReferensi: result.payment.nomorReferensi,
      },
      keterangan: `Mencatat pembayaran ${result.payment.metode} sebesar Rp ${result.payment.nominal}`,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return handleApiError(err, 'POST /api/folio/[id]/payment')
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
    const { paymentId, alasanVoid } = body

    if (!paymentId || !alasanVoid || !String(alasanVoid).trim()) {
      return NextResponse.json(
        { error: 'paymentId dan alasanVoid wajib diisi' },
        { status: 400 }
      )
    }

    const trimmedReason = String(alasanVoid).trim()

    const result = await prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payment.findFirst({
        where: { id: paymentId, folioId: id },
      })

      if (!existingPayment) {
        throw new HttpError('Data pembayaran tidak ditemukan', 404)
      }
      if (existingPayment.isVoid) {
        throw new HttpError('Pembayaran sudah di-void sebelumnya', 400)
      }

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          isVoid: true,
          alasanVoid: trimmedReason,
          voidAt: new Date(),
        },
      })

      const updatedFolio = await recalculateFolio(tx, id)
      return { existingPayment, payment: updatedPayment, folio: updatedFolio }
    })

    await createAuditLog({
      userId: auth.user.id,
      aksi: 'VOID',
      entitas: 'Payment',
      entitasId: result.payment.id,
      dataBefore: {
        isVoid: result.existingPayment.isVoid,
        nominal: result.existingPayment.nominal,
        metode: result.existingPayment.metode,
      },
      dataAfter: {
        isVoid: result.payment.isVoid,
        alasanVoid: result.payment.alasanVoid,
        voidAt: result.payment.voidAt,
      },
      keterangan: `Void pembayaran (${result.existingPayment.metode}): ${trimmedReason}`,
    })

    return NextResponse.json({ payment: result.payment, folio: result.folio })
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return handleApiError(err, 'PUT /api/folio/[id]/payment')
  }
}
