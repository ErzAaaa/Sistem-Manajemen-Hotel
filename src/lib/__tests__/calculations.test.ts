import { describe, it, expect } from 'vitest'
import { calculateTaxAndService, calculateDailyKPIs } from '../calculations'

describe('calculateTaxAndService', () => {
  it('calculates EXCLUSIVE ("++") 10% SC and 10% PBJT on (subtotal + SC)', () => {
    const res = calculateTaxAndService({
      baseAmount: 500000,
      pajakDaerahPct: 10,
      serviceChargePct: 10,
      modeHarga: 'EXCLUSIVE',
    })
    expect(res.subtotal).toBe(500000)
    expect(res.serviceCharge).toBe(50000)
    expect(res.pajak).toBe(55000)
    expect(res.total).toBe(605000)
  })

  it('calculates INCLUSIVE splitting total back to subtotal, SC, and PBJT', () => {
    const res = calculateTaxAndService({
      baseAmount: 605000,
      pajakDaerahPct: 10,
      serviceChargePct: 10,
      modeHarga: 'INCLUSIVE',
    })
    expect(res.subtotal).toBe(500000)
    expect(res.serviceCharge).toBe(50000)
    expect(res.pajak).toBe(55000)
    expect(res.total).toBe(605000)
  })

  it('returns zeros when baseAmount <= 0', () => {
    const res = calculateTaxAndService({
      baseAmount: 0,
      pajakDaerahPct: 10,
      serviceChargePct: 10,
      modeHarga: 'EXCLUSIVE',
    })
    expect(res).toEqual({ subtotal: 0, serviceCharge: 0, pajak: 0, total: 0 })
  })
})

describe('calculateDailyKPIs', () => {
  it('computes occupancy, ADR, RevPAR, operational profit, and cash profit', () => {
    const res = calculateDailyKPIs({
      pendapatanKamar: 2000000,
      pendapatanLain: 250000,
      biayaOperasional: 500000,
      biayaAlokasi: 200000,
      komisiOta: 150000,
      uangMasuk: 1800000,
      uangKeluar: 500000,
      kamarTersedia: 10,
      kamarTerjual: 5,
    })

    expect(res.totalPendapatan).toBe(2250000)
    expect(res.totalBiaya).toBe(850000)
    expect(res.labaOperasional).toBe(1400000)
    expect(res.labaKas).toBe(1300000)
    expect(res.okupansi).toBe(50.0)
    expect(res.adr).toBe(400000)
    expect(res.revpar).toBe(200000)
  })

  it('handles zero available/sold rooms safely', () => {
    const res = calculateDailyKPIs({
      pendapatanKamar: 0,
      pendapatanLain: 0,
      biayaOperasional: 0,
      biayaAlokasi: 0,
      komisiOta: 0,
      uangMasuk: 0,
      uangKeluar: 0,
      kamarTersedia: 0,
      kamarTerjual: 0,
    })
    expect(res.okupansi).toBe(0)
    expect(res.adr).toBe(0)
    expect(res.revpar).toBe(0)
  })
})
