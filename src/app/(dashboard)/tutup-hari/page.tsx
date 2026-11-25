'use client'

import { useEffect, useState } from 'react'
import { Moon, Lock, Unlock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatRupiah, formatTanggalPendek, formatPersen } from '@/lib/format'

interface PreviewData {
  tanggal: string
  status: 'OPEN' | 'CLOSED'
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

interface PendingCheckout {
  id: string
  kodeBooking: string
  guest: { nama: string }
  room: { nomor: string } | null
  folio: { balance: number } | null
}

interface HistoryItem {
  id: string
  tanggalBisnis: string
  status: string
  okupansi: number
  pendapatanKamar: number
  pendapatanLain: number
  totalBiaya: number
  labaOperasional: number
  labaKas: number
  closedBy: { nama: string } | null
}

export default function TutupHariPage() {
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10))
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [pendingCheckOuts, setPendingCheckOuts] = useState<PendingCheckout[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  async function loadData(tgl: string) {
    setLoading(true)
    const res = await fetch(`/api/tutup-hari?tanggal=${tgl}`)
    if (res.ok) {
      const data = await res.json()
      setPreview(data.preview)
      setPendingCheckOuts(data.pendingCheckOuts || [])
      setHistory(data.history || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData(tanggal)
  }, [tanggal])

  async function handleCloseDay() {
    setProcessing(true)
    setMsg(null)
    const res = await fetch('/api/tutup-hari', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tanggal, postRoomCharges: true }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMsg({ type: 'err', text: data.error || 'Gagal menutup hari bisnis' })
    } else {
      setMsg({ type: 'ok', text: `Hari bisnis ${tanggal} berhasil ditutup & dikunci.` })
      await loadData(tanggal)
    }
    setProcessing(false)
  }

  async function handleReopenDay() {
    const alasan = window.prompt('Masukkan alasan membuka kembali hari bisnis ini (khusus Manajer/Owner):')
    if (!alasan) return
    setProcessing(true)
    setMsg(null)
    const res = await fetch('/api/tutup-hari', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'REOPEN', tanggal, alasan }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMsg({ type: 'err', text: data.error || 'Gagal membuka kembali hari bisnis' })
    } else {
      setMsg({ type: 'ok', text: `Hari bisnis ${tanggal} dibuka kembali.` })
      await loadData(tanggal)
    }
    setProcessing(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tutup Hari (Night Audit)</h1>
          <p className="text-sm text-slate-500">Rekonsiliasi harian, posting biaya kamar, dan penguncian transaksi harian</p>
        </div>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        />
      </div>

      {msg && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${
          msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <CheckCircle2 className="w-4 h-4" />
          <span>{msg.text}</span>
        </div>
      )}

      {loading || !preview ? (
        <div className="p-6 text-slate-500">Memuat preview tutup hari...</div>
      ) : (
        <>
          {/* Pending Check-outs Alert */}
          {pendingCheckOuts.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Perhatian: {pendingCheckOuts.length} Tamu Belum Check-Out</span>
              </div>
              <ul className="text-xs text-amber-900 space-y-1 pl-6 list-disc">
                {pendingCheckOuts.map((p) => (
                  <li key={p.id}>
                    {p.guest.nama} (Kamar {p.room?.nomor || '-'}) — Sisa Tagihan: {formatRupiah(p.folio?.balance ?? 0)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Status & Action Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  preview.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
                }`}>
                  <Moon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Tanggal Bisnis: {formatTanggalPendek(preview.tanggal)}</h2>
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium mt-0.5 ${
                    preview.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    Status: {preview.status === 'CLOSED' ? 'TERTUTUP (TERKUNCI)' : 'TERBUKA'}
                  </span>
                </div>
              </div>

              {preview.status === 'OPEN' ? (
                <button
                  type="button"
                  disabled={processing}
                  onClick={handleCloseDay}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>{processing ? 'Memproses...' : 'Tutup Hari Sekarang'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={processing}
                  onClick={handleReopenDay}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Buka Kembali (Manajer)</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Kamar Terjual / Tersedia</p>
                <p className="text-lg font-bold">{preview.kamarTerjual} / {preview.kamarTersedia} ({formatPersen(preview.okupansi)})</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Pendapatan Bersih</p>
                <p className="text-lg font-bold text-slate-900">{formatRupiah(preview.totalPendapatan)}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Total Biaya (Opex + Alokasi + OTA)</p>
                <p className="text-lg font-bold text-red-600">{formatRupiah(preview.totalBiaya)}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg">
                <p className="text-xs text-emerald-700">Laba Operasional / Laba Kas</p>
                <p className="text-base font-bold text-emerald-700">
                  {formatRupiah(preview.labaOperasional)} / {formatRupiah(preview.labaKas)}
                </p>
              </div>
            </div>
          </div>

          {/* History Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 font-semibold text-sm text-slate-800">
              Riwayat Tutup Hari
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Tanggal Bisnis</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Okupansi</th>
                    <th className="py-3 px-4 text-right">Pendapatan</th>
                    <th className="py-3 px-4 text-right">Biaya</th>
                    <th className="py-3 px-4 text-right">Laba Ops</th>
                    <th className="py-3 px-4">Ditutup Oleh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">Belum ada riwayat tutup hari.</td>
                    </tr>
                  ) : (
                    history.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2.5 px-4 font-medium">{formatTanggalPendek(h.tanggalBisnis)}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            h.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {h.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">{formatPersen(h.okupansi)}</td>
                        <td className="py-2.5 px-4 text-right">{formatRupiah(h.pendapatanKamar + h.pendapatanLain)}</td>
                        <td className="py-2.5 px-4 text-right">{formatRupiah(h.totalBiaya)}</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-emerald-700">{formatRupiah(h.labaOperasional)}</td>
                        <td className="py-2.5 px-4 text-slate-600">{h.closedBy?.nama || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
