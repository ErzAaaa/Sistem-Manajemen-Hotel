import { prisma } from './prisma'
import { calculateDailyKPIs } from './calculations'

export interface DailyMetrics {
  tanggal: string
  kamarTersedia: number
  kamarTerjual: number
  okupansi: number
  adr: number
  revpar: number
  pendapatanKamar: number
  pendapatanLain: number
  totalPendapatan: number
  totalPajak: number
  totalServiceCharge: number
  biayaOperasional: number
  biayaAlokasi: number
  komisiOta: number
  totalBiaya: number
  labaOperasional: number
  labaKas: number
  uangMasuk: number
  uangKeluar: number
  posisiKas: number
}

export interface PeriodMetrics extends DailyMetrics {
  startDate: string
  endDate: string
  jumlahHari: number
  biayaInvestasi: number
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const MONTH_REGEX = /^\d{4}-\d{2}$/

export function isValidDateStr(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false
  const d = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export function isValidMonthStr(value: string): boolean {
  if (!MONTH_REGEX.test(value)) return false
  const [, monthStr] = value.split('-')
  const month = Number(monthStr)
  return month >= 1 && month <= 12
}

export function getTodayWIB(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

export function addDaysStr(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export function getDayBounds(dateStr: string): { dayStart: Date; dayEnd: Date } {
  return {
    dayStart: new Date(`${dateStr}T00:00:00.000Z`),
    dayEnd: new Date(`${dateStr}T23:59:59.999Z`),
  }
}

export function getMonthBounds(bulanStr: string): {
  startStr: string
  endStr: string
  daysInMonth: number
} {
  const [year, month] = bulanStr.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    startStr: `${bulanStr}-01`,
    endStr: `${bulanStr}-${String(daysInMonth).padStart(2, '0')}`,
    daysInMonth,
  }
}

export function countDaysInclusive(startStr: string, endStr: string): number {
  const start = new Date(`${startStr}T00:00:00.000Z`).getTime()
  const end = new Date(`${endStr}T00:00:00.000Z`).getTime()
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1)
}

/**
 * Menghitung overlap hari inklusif antara rentang [rangeStart, rangeEnd]
 * dan periode beban berulang [recStart, recEnd].
 */
export function countRecurringOverlapDays(
  recStart: Date,
  recEnd: Date,
  rangeStartStr: string,
  rangeEndStr: string
): number {
  const recStartStr = recStart.toISOString().slice(0, 10)
  const recEndStr = recEnd.toISOString().slice(0, 10)
  const effectiveStart = recStartStr > rangeStartStr ? recStartStr : rangeStartStr
  const effectiveEnd = recEndStr < rangeEndStr ? recEndStr : rangeEndStr
  if (effectiveEnd < effectiveStart) return 0
  return countDaysInclusive(effectiveStart, effectiveEnd)
}

/**
 * Menghitung metrik bisnis harian (live) untuk satu tanggal (YYYY-MM-DD).
 */
export async function computeDailyMetrics(dateStr: string): Promise<DailyMetrics> {
  const { dayStart, dayEnd } = getDayBounds(dateStr)

  const [
    kamarTersedia,
    overlappingReservations,
    charges,
    approvedExpenses,
    activeRecurring,
    payments,
    previousClose,
  ] = await Promise.all([
    prisma.room.count({
      where: {
        aktif: true,
        status: { not: 'OUT_OF_ORDER' },
      },
    }),
    prisma.reservation.findMany({
      where: {
        status: { in: ['CHECKED_IN', 'CHECKED_OUT'] },
        tanggalCheckIn: { lte: dayEnd },
        tanggalCheckOut: { gt: dayEnd },
      },
      select: { id: true },
    }),
    prisma.folioCharge.findMany({
      where: {
        isVoid: false,
        tanggal: { gte: dayStart, lte: dayEnd },
      },
      select: {
        kategori: true,
        nominal: true,
        pajak: true,
        serviceCharge: true,
        folio: { select: { reservationId: true } },
      },
    }),
    prisma.expense.findMany({
      where: {
        statusApproval: 'APPROVED',
        tanggal: { gte: dayStart, lte: dayEnd },
      },
      select: {
        categoryId: true,
        jenisBeban: true,
        nominal: true,
      },
    }),
    prisma.recurringExpense.findMany({
      where: {
        aktif: true,
        periodeAwal: { lte: dayEnd },
        periodeAkhir: { gte: dayStart },
      },
      select: {
        alokasiHarian: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        isVoid: false,
        metode: { not: 'DIBAYAR_OTA' },
        tanggal: { gte: dayStart, lte: dayEnd },
      },
      select: { nominal: true },
    }),
    prisma.dailyClose.findFirst({
      where: {
        tanggalBisnis: { lt: dayStart },
        status: 'CLOSED',
      },
      orderBy: { tanggalBisnis: 'desc' },
      select: { posisiKas: true },
    }),
  ])

  const soldReservationIds = new Set<string>(overlappingReservations.map((r) => r.id))
  let pendapatanKamar = 0
  let pendapatanLain = 0
  let totalPajak = 0
  let totalServiceCharge = 0

  for (const c of charges) {
    if (c.kategori === 'KAMAR') {
      pendapatanKamar += c.nominal
      if (c.folio?.reservationId) {
        soldReservationIds.add(c.folio.reservationId)
      }
    } else {
      pendapatanLain += c.nominal
    }
    totalPajak += c.pajak
    totalServiceCharge += c.serviceCharge
  }

  const kamarTerjual = soldReservationIds.size

  let biayaOperasional = 0
  let komisiOta = 0
  let uangKeluar = 0

  for (const exp of approvedExpenses) {
    uangKeluar += exp.nominal
    if (exp.categoryId === 'ec-komisi-ota') {
      komisiOta += exp.nominal
    } else if (exp.jenisBeban === 'OPERASIONAL') {
      biayaOperasional += exp.nominal
    }
  }

  const biayaAlokasi = Math.round(
    activeRecurring.reduce((sum, rec) => sum + rec.alokasiHarian, 0)
  )

  const uangMasuk = Math.round(payments.reduce((sum, p) => sum + p.nominal, 0))

  pendapatanKamar = Math.round(pendapatanKamar)
  pendapatanLain = Math.round(pendapatanLain)
  totalPajak = Math.round(totalPajak)
  totalServiceCharge = Math.round(totalServiceCharge)
  biayaOperasional = Math.round(biayaOperasional)
  komisiOta = Math.round(komisiOta)
  uangKeluar = Math.round(uangKeluar)

  const kpis = calculateDailyKPIs({
    pendapatanKamar,
    pendapatanLain,
    biayaOperasional,
    biayaAlokasi,
    komisiOta,
    uangMasuk,
    uangKeluar,
    kamarTersedia,
    kamarTerjual,
  })

  const posisiKas = Math.round((previousClose?.posisiKas ?? 0) + kpis.labaKas)

  return {
    tanggal: dateStr,
    kamarTersedia,
    kamarTerjual,
    okupansi: kpis.okupansi,
    adr: kpis.adr,
    revpar: kpis.revpar,
    pendapatanKamar,
    pendapatanLain,
    totalPendapatan: kpis.totalPendapatan,
    totalPajak,
    totalServiceCharge,
    biayaOperasional,
    biayaAlokasi,
    komisiOta,
    totalBiaya: kpis.totalBiaya,
    labaOperasional: kpis.labaOperasional,
    labaKas: kpis.labaKas,
    uangMasuk,
    uangKeluar,
    posisiKas,
  }
}

/**
 * Menghitung agregasi metrik periode [startStr, endStr] (untuk MTD dan YTD).
 */
export async function computePeriodMetrics(
  startStr: string,
  endStr: string
): Promise<PeriodMetrics> {
  const { dayStart: rangeStart } = getDayBounds(startStr)
  const { dayEnd: rangeEnd } = getDayBounds(endStr)
  const jumlahHari = countDaysInclusive(startStr, endStr)

  const [
    activeRoomsCount,
    reservations,
    charges,
    approvedExpenses,
    activeRecurring,
    payments,
  ] = await Promise.all([
    prisma.room.count({
      where: {
        aktif: true,
        status: { not: 'OUT_OF_ORDER' },
      },
    }),
    prisma.reservation.findMany({
      where: {
        status: { in: ['CHECKED_IN', 'CHECKED_OUT'] },
        tanggalCheckIn: { lte: rangeEnd },
        tanggalCheckOut: { gt: rangeStart },
      },
      select: {
        id: true,
        tanggalCheckIn: true,
        tanggalCheckOut: true,
      },
    }),
    prisma.folioCharge.findMany({
      where: {
        isVoid: false,
        tanggal: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        tanggal: true,
        kategori: true,
        nominal: true,
        pajak: true,
        serviceCharge: true,
        folio: { select: { reservationId: true } },
      },
    }),
    prisma.expense.findMany({
      where: {
        statusApproval: 'APPROVED',
        tanggal: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        categoryId: true,
        jenisBeban: true,
        nominal: true,
      },
    }),
    prisma.recurringExpense.findMany({
      where: {
        aktif: true,
        periodeAwal: { lte: rangeEnd },
        periodeAkhir: { gte: rangeStart },
      },
      select: {
        periodeAwal: true,
        periodeAkhir: true,
        alokasiHarian: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        isVoid: false,
        metode: { not: 'DIBAYAR_OTA' },
        tanggal: { gte: rangeStart, lte: rangeEnd },
      },
      select: { nominal: true },
    }),
  ])

  const kamarTersedia = activeRoomsCount * jumlahHari

  // Hitung room-nights terjual per tanggal (deduplikasi reservasi & FolioCharge KAMAR per hari)
  const soldRoomNights = new Set<string>()
  for (const res of reservations) {
    const ciStr = res.tanggalCheckIn.toISOString().slice(0, 10)
    // Checkout day tidak dihitung malam menginap kecuali tanggalCheckOut > dayEnd
    let cursor = ciStr > startStr ? ciStr : startStr
    while (cursor <= endStr) {
      const { dayEnd } = getDayBounds(cursor)
      if (res.tanggalCheckIn <= dayEnd && res.tanggalCheckOut > dayEnd) {
        soldRoomNights.add(`${cursor}:${res.id}`)
      }
      cursor = addDaysStr(cursor, 1)
    }
  }

  let pendapatanKamar = 0
  let pendapatanLain = 0
  let totalPajak = 0
  let totalServiceCharge = 0

  for (const c of charges) {
    if (c.kategori === 'KAMAR') {
      pendapatanKamar += c.nominal
      if (c.folio?.reservationId) {
        const chargeDate = c.tanggal.toISOString().slice(0, 10)
        soldRoomNights.add(`${chargeDate}:${c.folio.reservationId}`)
      }
    } else {
      pendapatanLain += c.nominal
    }
    totalPajak += c.pajak
    totalServiceCharge += c.serviceCharge
  }

  const kamarTerjual = soldRoomNights.size

  let biayaOperasional = 0
  let komisiOta = 0
  let biayaInvestasi = 0
  let uangKeluar = 0

  for (const exp of approvedExpenses) {
    uangKeluar += exp.nominal
    if (exp.categoryId === 'ec-komisi-ota') {
      komisiOta += exp.nominal
    } else if (exp.jenisBeban === 'OPERASIONAL') {
      biayaOperasional += exp.nominal
    } else if (exp.jenisBeban === 'INVESTASI') {
      biayaInvestasi += exp.nominal
    }
  }

  let biayaAlokasi = 0
  for (const rec of activeRecurring) {
    const overlapDays = countRecurringOverlapDays(
      rec.periodeAwal,
      rec.periodeAkhir,
      startStr,
      endStr
    )
    biayaAlokasi += rec.alokasiHarian * overlapDays
  }

  const uangMasuk = Math.round(payments.reduce((sum, p) => sum + p.nominal, 0))

  pendapatanKamar = Math.round(pendapatanKamar)
  pendapatanLain = Math.round(pendapatanLain)
  totalPajak = Math.round(totalPajak)
  totalServiceCharge = Math.round(totalServiceCharge)
  biayaOperasional = Math.round(biayaOperasional)
  komisiOta = Math.round(komisiOta)
  biayaInvestasi = Math.round(biayaInvestasi)
  biayaAlokasi = Math.round(biayaAlokasi)
  uangKeluar = Math.round(uangKeluar)

  const kpis = calculateDailyKPIs({
    pendapatanKamar,
    pendapatanLain,
    biayaOperasional,
    biayaAlokasi,
    komisiOta,
    uangMasuk,
    uangKeluar,
    kamarTersedia,
    kamarTerjual,
  })

  return {
    tanggal: endStr,
    startDate: startStr,
    endDate: endStr,
    jumlahHari,
    kamarTersedia,
    kamarTerjual,
    okupansi: kpis.okupansi,
    adr: kpis.adr,
    revpar: kpis.revpar,
    pendapatanKamar,
    pendapatanLain,
    totalPendapatan: kpis.totalPendapatan,
    totalPajak,
    totalServiceCharge,
    biayaOperasional,
    biayaAlokasi,
    komisiOta,
    biayaInvestasi,
    totalBiaya: kpis.totalBiaya,
    labaOperasional: kpis.labaOperasional,
    labaKas: kpis.labaKas,
    uangMasuk,
    uangKeluar,
    posisiKas: kpis.labaKas,
  }
}
