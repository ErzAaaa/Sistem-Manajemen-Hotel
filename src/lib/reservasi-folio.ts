import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { calculateTaxAndService, TaxCalculationResult } from './calculations'
import { decryptText } from './crypto'
import { maskIdentitas } from './format'

export type DbClient = Prisma.TransactionClient | typeof prisma

export class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export interface ActiveTaxSettings {
  pajakDaerahPct: number
  serviceChargePct: number
  modeHarga: 'INCLUSIVE' | 'EXCLUSIVE'
}

/**
 * Mengambil konfigurasi pajak & service charge aktif terbaru.
 */
export async function getActiveTaxConfig(db: DbClient = prisma): Promise<ActiveTaxSettings> {
  const config = await db.taxConfig.findFirst({
    where: { aktif: true },
    orderBy: { berlakuSejak: 'desc' },
  })
  return {
    pajakDaerahPct: config?.pajakDaerahPct ?? 10,
    serviceChargePct: config?.serviceChargePct ?? 10,
    modeHarga: config?.modeHarga === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE',
  }
}

/**
 * Menyamarkan nomor identitas tamu agar data sensitif tidak terekspos di API.
 */
export function maskGuestIdentity<T extends { nomorIdentitas?: string | null }>(
  guest: T | null | undefined
): T | null | undefined {
  if (!guest) return guest
  if (!guest.nomorIdentitas) return { ...guest, nomorIdentitas: null }
  const plain = decryptText(guest.nomorIdentitas)
  return {
    ...guest,
    nomorIdentitas: maskIdentitas(plain),
  }
}

/**
 * Mengecek apakah kamar tersedia pada rentang tanggal [checkIn, checkOut)
 * (tidak ada reservasi CONFIRMED/CHECKED_IN yang bertumpukan).
 */
export async function findRoomConflict(
  db: DbClient,
  roomId: string,
  checkIn: Date,
  checkOut: Date,
  excludeReservationId?: string
) {
  return db.reservation.findFirst({
    where: {
      roomId,
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      status: { in: ['CONFIRMED', 'CHECKED_IN'] },
      tanggalCheckIn: { lt: checkOut },
      tanggalCheckOut: { gt: checkIn },
    },
    select: { id: true, kodeBooking: true, status: true },
  })
}

export interface ReservationPriceInput {
  tarifPerMalam: number
  jumlahMalam: number
  diskonPct?: number | null
  diskonNominal?: number | null
  extraBed?: boolean
  biayaExtraBed?: number | null
  biayaTambahan?: number | null
}

export interface ReservationPriceBreakdown {
  baseTotal: number
  totalDiskon: number
  taxResult: TaxCalculationResult
}

/**
 * Menghitung total tarif kamar, diskon, biaya tambahan, pajak, dan service charge.
 */
export function computeReservationTotals(
  input: ReservationPriceInput,
  taxConfig: ActiveTaxSettings
): ReservationPriceBreakdown {
  const baseTotal = Math.round(input.tarifPerMalam * input.jumlahMalam)
  const diskonPct = input.diskonPct ? Number(input.diskonPct) : 0
  const diskonNominal = input.diskonNominal ? Number(input.diskonNominal) : 0

  const potonganPct = diskonPct > 0 ? Math.round(baseTotal * (diskonPct / 100)) : 0
  const totalDiskon = potonganPct + Math.round(diskonNominal)

  const extraBedFee = input.extraBed && input.biayaExtraBed ? Math.round(Number(input.biayaExtraBed)) : 0
  const otherExtraFee = input.biayaTambahan ? Math.round(Number(input.biayaTambahan)) : 0

  const taxableBase = Math.max(0, baseTotal - totalDiskon + extraBedFee + otherExtraFee)
  const taxResult = calculateTaxAndService({
    baseAmount: taxableBase,
    pajakDaerahPct: taxConfig.pajakDaerahPct,
    serviceChargePct: taxConfig.serviceChargePct,
    modeHarga: taxConfig.modeHarga,
  })

  return { baseTotal, totalDiskon, taxResult }
}

/**
 * Menghitung ulang totalCharge, totalPayment, dan balance pada Folio
 * berdasarkan item charge dan payment yang tidak di-void.
 */
export async function recalculateFolio(db: DbClient, folioId: string) {
  const [chargeAgg, paymentAgg] = await Promise.all([
    db.folioCharge.aggregate({
      where: { folioId, isVoid: false },
      _sum: { total: true },
    }),
    db.payment.aggregate({
      where: { folioId, isVoid: false },
      _sum: { nominal: true },
    }),
  ])

  const totalCharge = Math.round(chargeAgg._sum.total ?? 0)
  const totalPayment = Math.round(paymentAgg._sum.nominal ?? 0)
  const balance = totalCharge - totalPayment

  return db.folio.update({
    where: { id: folioId },
    data: { totalCharge, totalPayment, balance },
  })
}

/**
 * Membuat kode unik dengan prefix (mis. RES-..., FOL-...).
 */
export function generateReferenceCode(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `${prefix}-${ts}${rand}`
}
