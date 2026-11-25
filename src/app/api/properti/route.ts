import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeApi, handleApiError } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'

const VALID_TAX_MODES = ['INCLUSIVE', 'EXCLUSIVE']

export async function GET() {
  try {
    const auth = await authorizeApi()
    if (auth.error) return auth.error

    const [property, taxConfig, taxHistory] = await Promise.all([
      prisma.property.findFirst(),
      prisma.taxConfig.findFirst({
        where: { aktif: true },
        orderBy: { berlakuSejak: 'desc' },
      }),
      prisma.taxConfig.findMany({
        orderBy: { berlakuSejak: 'desc' },
      }),
    ])

    return NextResponse.json({ property, taxConfig, taxHistory })
  } catch (err) {
    return handleApiError(err, 'GET /api/properti')
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorizeApi('properti.write')
    if (auth.error) return auth.error

    const body = await request.json()

    if (body.taxConfig && typeof body.taxConfig === 'object') {
      const { pajakDaerahPct, serviceChargePct, modeHarga } = body.taxConfig

      const pajak = Number(pajakDaerahPct)
      const service = Number(serviceChargePct)
      const mode = typeof modeHarga === 'string' ? modeHarga : 'EXCLUSIVE'

      if (Number.isNaN(pajak) || pajak < 0 || pajak > 100) {
        return NextResponse.json(
          { error: 'Persentase pajak daerah harus antara 0 dan 100.' },
          { status: 400 }
        )
      }

      if (Number.isNaN(service) || service < 0 || service > 100) {
        return NextResponse.json(
          { error: 'Persentase service charge harus antara 0 dan 100.' },
          { status: 400 }
        )
      }

      if (!VALID_TAX_MODES.includes(mode)) {
        return NextResponse.json(
          { error: 'Mode harga tidak valid. Pilihan: INCLUSIVE atau EXCLUSIVE.' },
          { status: 400 }
        )
      }

      const previousTaxConfig = await prisma.taxConfig.findFirst({
        where: { aktif: true },
        orderBy: { berlakuSejak: 'desc' },
      })

      const newTaxConfig = await prisma.$transaction(async (tx) => {
        await tx.taxConfig.updateMany({
          where: { aktif: true },
          data: { aktif: false },
        })

        return tx.taxConfig.create({
          data: {
            pajakDaerahPct: pajak,
            serviceChargePct: service,
            modeHarga: mode,
            berlakuSejak: new Date(),
            aktif: true,
          },
        })
      })

      await createAuditLog({
        userId: auth.user.id,
        aksi: 'UPDATE',
        entitas: 'TaxConfig',
        entitasId: newTaxConfig.id,
        dataBefore: previousTaxConfig
          ? {
              pajakDaerahPct: previousTaxConfig.pajakDaerahPct,
              serviceChargePct: previousTaxConfig.serviceChargePct,
              modeHarga: previousTaxConfig.modeHarga,
            }
          : undefined,
        dataAfter: {
          pajakDaerahPct: newTaxConfig.pajakDaerahPct,
          serviceChargePct: newTaxConfig.serviceChargePct,
          modeHarga: newTaxConfig.modeHarga,
          berlakuSejak: newTaxConfig.berlakuSejak.toISOString(),
        },
        keterangan: `Memperbarui konfigurasi pajak: Pajak ${newTaxConfig.pajakDaerahPct}%, Service Charge ${newTaxConfig.serviceChargePct}%, Mode ${newTaxConfig.modeHarga}`,
      })

      const taxHistory = await prisma.taxConfig.findMany({
        orderBy: { berlakuSejak: 'desc' },
      })

      return NextResponse.json({ taxConfig: newTaxConfig, taxHistory })
    }

    const allowedFields = [
      'nama',
      'alamat',
      'kota',
      'provinsi',
      'zonaWaktu',
      'jamCheckIn',
      'jamCheckOut',
      'cutOffHariBisnis',
      'telepon',
      'email',
    ] as const

    const propertyData: Record<string, string | null> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'nama') {
          if (typeof body.nama !== 'string' || !body.nama.trim()) {
            return NextResponse.json(
              { error: 'Nama properti wajib diisi.' },
              { status: 400 }
            )
          }
          propertyData.nama = body.nama.trim()
        } else {
          propertyData[field] =
            typeof body[field] === 'string' && body[field].trim()
              ? body[field].trim()
              : null
        }
      }
    }

    if (Object.keys(propertyData).length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada data properti atau pajak yang dikirim untuk diperbarui.' },
        { status: 400 }
      )
    }

    const existing = await prisma.property.findFirst()

    if (!existing) {
      if (!propertyData.nama) {
        return NextResponse.json(
          { error: 'Nama properti wajib diisi.' },
          { status: 400 }
        )
      }

      const created = await prisma.property.create({
        data: {
          nama: propertyData.nama,
          alamat: propertyData.alamat ?? null,
          kota: propertyData.kota ?? null,
          provinsi: propertyData.provinsi ?? null,
          zonaWaktu: propertyData.zonaWaktu ?? 'Asia/Jakarta',
          jamCheckIn: propertyData.jamCheckIn ?? '14:00',
          jamCheckOut: propertyData.jamCheckOut ?? '12:00',
          cutOffHariBisnis: propertyData.cutOffHariBisnis ?? '06:00',
          telepon: propertyData.telepon ?? null,
          email: propertyData.email ?? null,
        },
      })

      await createAuditLog({
        userId: auth.user.id,
        aksi: 'CREATE',
        entitas: 'Property',
        entitasId: created.id,
        dataAfter: created as unknown as Record<string, unknown>,
        keterangan: `Membuat data properti: ${created.nama}`,
      })

      return NextResponse.json({ property: created })
    }

    const updated = await prisma.property.update({
      where: { id: existing.id },
      data: propertyData,
    })

    await createAuditLog({
      userId: auth.user.id,
      aksi: 'UPDATE',
      entitas: 'Property',
      entitasId: updated.id,
      dataBefore: {
        nama: existing.nama,
        alamat: existing.alamat,
        kota: existing.kota,
        provinsi: existing.provinsi,
        zonaWaktu: existing.zonaWaktu,
        jamCheckIn: existing.jamCheckIn,
        jamCheckOut: existing.jamCheckOut,
        cutOffHariBisnis: existing.cutOffHariBisnis,
        telepon: existing.telepon,
        email: existing.email,
      },
      dataAfter: {
        nama: updated.nama,
        alamat: updated.alamat,
        kota: updated.kota,
        provinsi: updated.provinsi,
        zonaWaktu: updated.zonaWaktu,
        jamCheckIn: updated.jamCheckIn,
        jamCheckOut: updated.jamCheckOut,
        cutOffHariBisnis: updated.cutOffHariBisnis,
        telepon: updated.telepon,
        email: updated.email,
      },
      keterangan: `Memperbarui profil properti: ${updated.nama}`,
    })

    return NextResponse.json({ property: updated })
  } catch (err) {
    return handleApiError(err, 'PUT /api/properti')
  }
}
