'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Download, Printer, TrendingUp, Wallet, BedDouble } from 'lucide-react'
import { formatRupiah, formatPersen } from '@/lib/format'

interface DailyFlash {
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
  labaOperasional?: number
  labaKas?: number
  uangMasuk: number
  uangKeluar: number
  posisiKas: number
  isClosed?: boolean
}

interface PeriodSummary {
  totalPendapatan: number
  totalBiaya: number
  labaOperasional?: number
  labaKas?: number
  okupansi?: number
}

interface LaporanResponse {
  tanggal: string
  bulan: string
  canViewProfit: boolean
  dailyFlash: DailyFlash
  yesterdayFlash: DailyFlash
  mtd: PeriodSummary
  ytd: PeriodSummary
  usaliMonthly: {
    bulan: string
    totalPendapatan: number
    biayaDepartemen: number
    biayaTakTerdistribusi: number
    biayaTetap: number
    totalBiaya: number
    gop?: number
    labaBersihOperasional?: number
    departemen: Record<string, { pendapatan: number; biaya: number; labaDepartemen?: number }>
  }
  expenseByCategory: { categoryId: string; nama: string; departemen: string; realisasi: number; alokasi: number; total: number }[]
  revenueByCategory: { kategori: string; nominal: number; pajak: number; serviceCharge: number; total: number }[]
}

export default function LaporanPage() {
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [bulan, setBulan] = useState(new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<LaporanResponse | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadReport(tgl: string, bln: string) {
    setLoading(true)
    const res = await fetch(`/api/laporan?tanggal=${tgl}&bulan=${bln}`)
    if (res.ok) {
      setData(await res.json())
    }
    setLoading(false)
  }

  useEffect(() => {
    loadReport(tanggal, bulan)
  }, [tanggal, bulan])

  function exportCsv() {
    if (!data) return
    const f = data.dailyFlash
    const rows = [
      ['Laporan Daily Flash Hotel', data.tanggal],
      ['Kamar Tersedia', f.kamarTersedia],
      ['Kamar Terjual', f.kamarTerjual],
      ['Okupansi (%)', f.okupansi],
      ['ADR', f.adr],
      ['RevPAR', f.revpar],
      ['Pendapatan Kamar', f.pendapatanKamar],
      ['Pendapatan Lain', f.pendapatanLain],
      ['Total Pendapatan', f.totalPendapatan],
      ['Pajak Daerah (Titipan)', f.totalPajak],
      ['Service Charge', f.totalServiceCharge],
      ['Biaya Operasional', f.biayaOperasional],
      ['Alokasi Biaya Berulang', f.biayaAlokasi],
      ['Komisi OTA', f.komisiOta],
      ['Total Biaya', f.totalBiaya],
    ]
    if (data.canViewProfit) {
      rows.push(['Laba Operasional Harian', f.labaOperasional ?? 0])
      rows.push(['Laba Kas Harian', f.labaKas ?? 0])
    }
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `daily-flash-${data.tanggal}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading || !data) {
    return <div className="p-6 text-slate-500">Memuat Daily Flash Report...</div>
  }

  const f = data.dailyFlash
  const y = data.yesterdayFlash
  const deltaPendapatan = f.totalPendapatan - y.totalPendapatan

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-600" />
            <span>Daily Flash &amp; Laba Harian</span>
          </h1>
          <p className="text-sm text-slate-500">
            Ringkasan kinerja operasional, laba operasional, laba kas, MTD/YTD &amp; USALI-lite
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
          />
          <input
            type="month"
            value={bulan}
            onChange={(e) => setBulan(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
          />
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-medium cursor-pointer"
          >
            <Download className="w-4 h-4" /> Ekspor CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Cetak PDF
          </button>
        </div>
      </div>

      {/* Hero KPI Cards (Mobile-friendly for Owner) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Okupansi Hari Ini</span>
            <BedDouble className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1">{formatPersen(f.okupansi)}</p>
          <p className="text-xs text-slate-500 mt-1">
            {f.kamarTerjual} / {f.kamarTersedia} kamar · ADR {formatRupiah(f.adr)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Pendapatan Hari Ini</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-1">{formatRupiah(f.totalPendapatan)}</p>
          <p className={`text-xs mt-1 ${deltaPendapatan >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {deltaPendapatan >= 0 ? '+' : ''}{formatRupiah(deltaPendapatan)} vs kemarin
          </p>
        </div>

        {data.canViewProfit && (
          <>
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between text-xs text-emerald-100">
                <span>Laba Operasional Harian</span>
                <TrendingUp className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold mt-1">{formatRupiah(f.labaOperasional ?? 0)}</p>
              <p className="text-xs text-emerald-100 mt-1">
                Biaya: {formatRupiah(f.totalBiaya)} (incl. alokasi)
              </p>
            </div>

            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between text-xs text-indigo-100">
                <span>Laba Kas Harian</span>
                <Wallet className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold mt-1">{formatRupiah(f.labaKas ?? 0)}</p>
              <p className="text-xs text-indigo-100 mt-1">
                Masuk {formatRupiah(f.uangMasuk)} · Keluar {formatRupiah(f.uangKeluar)}
              </p>
            </div>
          </>
        )}
      </div>

      {/* MTD & YTD */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">Akumulasi Bulan Ini (MTD)</h2>
          <div className="grid grid-cols-3 gap-3 text-xs pt-1">
            <div>
              <p className="text-slate-500">Pendapatan</p>
              <p className="font-bold text-slate-900 text-sm">{formatRupiah(data.mtd.totalPendapatan)}</p>
            </div>
            <div>
              <p className="text-slate-500">Biaya</p>
              <p className="font-bold text-red-600 text-sm">{formatRupiah(data.mtd.totalBiaya)}</p>
            </div>
            {data.canViewProfit && (
              <div>
                <p className="text-slate-500">Laba Ops</p>
                <p className="font-bold text-emerald-600 text-sm">{formatRupiah(data.mtd.labaOperasional ?? 0)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">Akumulasi Tahun Ini (YTD)</h2>
          <div className="grid grid-cols-3 gap-3 text-xs pt-1">
            <div>
              <p className="text-slate-500">Pendapatan</p>
              <p className="font-bold text-slate-900 text-sm">{formatRupiah(data.ytd.totalPendapatan)}</p>
            </div>
            <div>
              <p className="text-slate-500">Biaya</p>
              <p className="font-bold text-red-600 text-sm">{formatRupiah(data.ytd.totalBiaya)}</p>
            </div>
            {data.canViewProfit && (
              <div>
                <p className="text-slate-500">Laba Ops</p>
                <p className="font-bold text-emerald-600 text-sm">{formatRupiah(data.ytd.labaOperasional ?? 0)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* USALI-Lite Monthly Statement */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <h2 className="font-semibold text-slate-800 text-sm">Laporan Bulanan Format USALI-Lite ({data.usaliMonthly.bulan})</h2>
          {data.canViewProfit && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-700">
              GOP: {formatRupiah(data.usaliMonthly.gop ?? 0)}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="py-2.5 px-3">Departemen / Pos</th>
                <th className="py-2.5 px-3 text-right">Pendapatan</th>
                <th className="py-2.5 px-3 text-right">Biaya</th>
                {data.canViewProfit && <th className="py-2.5 px-3 text-right">Laba / GOP</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(data.usaliMonthly.departemen).map(([dept, val]) => (
                <tr key={dept}>
                  <td className="py-2.5 px-3 font-medium">{dept.replace(/_/g, ' ')}</td>
                  <td className="py-2.5 px-3 text-right">{formatRupiah(val.pendapatan)}</td>
                  <td className="py-2.5 px-3 text-right">{formatRupiah(val.biaya)}</td>
                  {data.canViewProfit && (
                    <td className="py-2.5 px-3 text-right font-semibold">
                      {val.labaDepartemen !== undefined ? formatRupiah(val.labaDepartemen) : '-'}
                    </td>
                  )}
                </tr>
              ))}
              {data.canViewProfit && (
                <tr className="bg-slate-50 font-bold">
                  <td className="py-3 px-3">Laba Bersih Operasional (Setelah Biaya Tetap)</td>
                  <td className="py-3 px-3 text-right">{formatRupiah(data.usaliMonthly.totalPendapatan)}</td>
                  <td className="py-3 px-3 text-right">{formatRupiah(data.usaliMonthly.totalBiaya)}</td>
                  <td className="py-3 px-3 text-right text-emerald-700">
                    {formatRupiah(data.usaliMonthly.labaBersihOperasional ?? 0)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h3 className="font-semibold text-sm text-slate-800">Pendapatan per Kategori (Bulan {data.bulan})</h3>
          <div className="space-y-2 text-xs">
            {data.revenueByCategory.length === 0 ? (
              <p className="text-slate-500">Belum ada pendapatan tercatat.</p>
            ) : (
              data.revenueByCategory.map((r) => (
                <div key={r.kategori} className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="font-medium">{r.kategori}</span>
                  <div className="text-right">
                    <span className="font-semibold text-slate-900">{formatRupiah(r.nominal)}</span>
                    <span className="block text-[10px] text-slate-400">Pajak+SC: {formatRupiah(r.pajak + r.serviceCharge)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h3 className="font-semibold text-sm text-slate-800">Pengeluaran per Kategori (Bulan {data.bulan})</h3>
          <div className="space-y-2 text-xs">
            {data.expenseByCategory.length === 0 ? (
              <p className="text-slate-500">Belum ada pengeluaran tercatat.</p>
            ) : (
              data.expenseByCategory.map((e) => (
                <div key={e.categoryId} className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <div>
                    <span className="font-medium">{e.nama}</span>
                    <span className="block text-[10px] text-slate-400">{e.departemen.replace(/_/g, ' ')}</span>
                  </div>
                  <span className="font-semibold text-red-600">{formatRupiah(e.total)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
