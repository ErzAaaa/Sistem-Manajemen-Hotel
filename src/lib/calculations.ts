// Kalkulasi Pajak, Service Charge, Tarif, dan Laba Harian (Rupiah penuh)

export interface TaxCalculationInput {
  baseAmount: number
  pajakDaerahPct: number
  serviceChargePct: number
  modeHarga: 'INCLUSIVE' | 'EXCLUSIVE'
}

export interface TaxCalculationResult {
  subtotal: number      // Pendapatan bersih (di luar pajak & SC)
  serviceCharge: number // Service charge (rupiah penuh)
  pajak: number         // Pajak daerah (rupiah penuh)
  total: number         // Total dibayar tamu
}

/**
 * Menghitung pajak daerah & service charge.
 * Mengikuti praktik umum Indonesia: service charge dihitung dari subtotal,
 * lalu pajak daerah dihitung dari (subtotal + service charge).
 * Pembulatan ke rupiah penuh (Math.round).
 */
export function calculateTaxAndService(input: TaxCalculationInput): TaxCalculationResult {
  const { baseAmount, pajakDaerahPct, serviceChargePct, modeHarga } = input
  const scRate = serviceChargePct / 100
  const taxRate = pajakDaerahPct / 100

  if (baseAmount <= 0) {
    return { subtotal: 0, serviceCharge: 0, pajak: 0, total: 0 }
  }

  if (modeHarga === 'INCLUSIVE') {
    // total = subtotal * (1 + scRate) * (1 + taxRate)
    const multiplier = (1 + scRate) * (1 + taxRate)
    const subtotal = Math.round(baseAmount / multiplier)
    const serviceCharge = Math.round(subtotal * scRate)
    const pajak = Math.round(baseAmount - subtotal - serviceCharge)
    return {
      subtotal,
      serviceCharge,
      pajak: Math.max(0, pajak),
      total: Math.round(baseAmount),
    }
  }

  // EXCLUSIVE ("++")
  const subtotal = Math.round(baseAmount)
  const serviceCharge = Math.round(subtotal * scRate)
  const pajak = Math.round((subtotal + serviceCharge) * taxRate)
  const total = subtotal + serviceCharge + pajak
  return { subtotal, serviceCharge, pajak, total }
}

export interface DailyProfitInput {
  pendapatanKamar: number
  pendapatanLain: number
  biayaOperasional: number
  biayaAlokasi: number
  komisiOta: number
  uangMasuk: number
  uangKeluar: number
  kamarTersedia: number
  kamarTerjual: number
}

export interface DailyProfitResult {
  totalPendapatan: number
  totalBiaya: number
  labaOperasional: number
  labaKas: number
  okupansi: number
  adr: number
  revpar: number
}

export function calculateDailyKPIs(input: DailyProfitInput): DailyProfitResult {
  const totalPendapatan = Math.round(input.pendapatanKamar + input.pendapatanLain)
  const totalBiaya = Math.round(input.biayaOperasional + input.biayaAlokasi + input.komisiOta)
  const labaOperasional = Math.round(totalPendapatan - totalBiaya)
  const labaKas = Math.round(input.uangMasuk - input.uangKeluar)

  const okupansi = input.kamarTersedia > 0
    ? Number(((input.kamarTerjual / input.kamarTersedia) * 100).toFixed(1))
    : 0

  const adr = input.kamarTerjual > 0
    ? Math.round(input.pendapatanKamar / input.kamarTerjual)
    : 0

  const revpar = input.kamarTersedia > 0
    ? Math.round(input.pendapatanKamar / input.kamarTersedia)
    : 0

  return {
    totalPendapatan,
    totalBiaya,
    labaOperasional,
    labaKas,
    okupansi,
    adr,
    revpar,
  }
}
