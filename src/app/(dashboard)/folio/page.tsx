'use client'

import { useEffect, useState } from 'react'
import { Receipt, Plus, Printer, CreditCard, Ban } from 'lucide-react'
import { formatRupiah, formatTanggalPendek } from '@/lib/format'

interface Charge {
  id: string
  tanggal: string
  kategori: string
  deskripsi: string
  nominal: number
  pajak: number
  serviceCharge: number
  total: number
  isVoid: boolean
  alasanVoid: string | null
}

interface Payment {
  id: string
  tanggal: string
  metode: string
  nominal: number
  keterangan: string | null
  nomorReferensi: string | null
  isVoid: boolean
  alasanVoid: string | null
}

interface FolioItem {
  id: string
  nomorFolio: string
  status: string
  totalCharge: number
  totalPayment: number
  balance: number
  reservation: {
    kodeBooking: string
    guest: { nama: string; telepon: string | null }
    room: { nomor: string; roomType: { nama: string } } | null
  } | null
  charges: Charge[]
  payments: Payment[]
}

export default function FolioPage() {
  const [folios, setFolios] = useState<FolioItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedFolio, setSelectedFolio] = useState<FolioItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [chargeForm, setChargeForm] = useState({
    kategori: 'MAKAN',
    deskripsi: '',
    nominal: '',
  })

  const [payForm, setPayForm] = useState({
    metode: 'TUNAI',
    nominal: '',
    nomorReferensi: '',
    keterangan: '',
  })

  async function loadFolios() {
    setLoading(true)
    const res = await fetch('/api/folio')
    if (res.ok) {
      const data = await res.json()
      const list: FolioItem[] = data.folios || []
      setFolios(list)
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id)
      }
    }
    setLoading(false)
  }

  async function loadDetail(id: string) {
    const res = await fetch(`/api/folio/${id}`)
    if (res.ok) {
      const data = await res.json()
      setSelectedFolio(data.folio)
    }
  }

  useEffect(() => {
    loadFolios()
  }, [])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
  }, [selectedId])

  async function handleAddCharge(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    setErr('')
    const res = await fetch(`/api/folio/${selectedId}/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kategori: chargeForm.kategori,
        deskripsi: chargeForm.deskripsi,
        nominal: Number(chargeForm.nominal),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErr(data.error || 'Gagal menambah biaya')
      return
    }
    setChargeForm({ kategori: 'MAKAN', deskripsi: '', nominal: '' })
    await Promise.all([loadDetail(selectedId), loadFolios()])
  }

  async function handleVoidCharge(chargeId: string) {
    if (!selectedId) return
    const alasan = window.prompt('Masukkan alasan void biaya ini:')
    if (!alasan) return
    const res = await fetch(`/api/folio/${selectedId}/charge`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chargeId, alasanVoid: alasan }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErr(data.error || 'Gagal void biaya')
      return
    }
    await Promise.all([loadDetail(selectedId), loadFolios()])
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    setErr('')
    const res = await fetch(`/api/folio/${selectedId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metode: payForm.metode,
        nominal: Number(payForm.nominal),
        nomorReferensi: payForm.nomorReferensi || null,
        keterangan: payForm.keterangan || null,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErr(data.error || 'Gagal mencatat pembayaran')
      return
    }
    setPayForm({ metode: 'TUNAI', nominal: '', nomorReferensi: '', keterangan: '' })
    await Promise.all([loadDetail(selectedId), loadFolios()])
  }

  async function handleVoidPayment(paymentId: string) {
    if (!selectedId) return
    const alasan = window.prompt('Masukkan alasan void pembayaran ini:')
    if (!alasan) return
    const res = await fetch(`/api/folio/${selectedId}/payment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, alasanVoid: alasan }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErr(data.error || 'Gagal void pembayaran')
      return
    }
    await Promise.all([loadDetail(selectedId), loadFolios()])
  }

  if (loading) return <div className="p-6 text-slate-500">Memuat data folio...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Folio &amp; Kasir</h1>
          <p className="text-sm text-slate-500">Tagihan tamu, biaya tambahan, multi-metode pembayaran, void &amp; kuitansi</p>
        </div>
      </div>

      {err && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg print:hidden">{err}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daftar Folio */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden print:hidden">
          <div className="p-4 border-b border-slate-200 font-semibold text-sm text-slate-800 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-600" /> Daftar Folio ({folios.length})
          </div>
          <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
            {folios.length === 0 ? (
              <div className="p-6 text-xs text-slate-500 text-center">Belum ada folio. Buat reservasi terlebih dahulu.</div>
            ) : (
              folios.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  className={`w-full text-left p-4 hover:bg-slate-50 transition cursor-pointer ${
                    selectedId === f.id ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-sm text-slate-900">
                      {f.reservation?.guest?.nama || 'Tamu'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      f.status === 'OPEN' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {f.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {f.nomorFolio} · Kamar {f.reservation?.room?.nomor || '-'}
                  </p>
                  <div className="flex justify-between items-center mt-2 text-xs">
                    <span className="text-slate-500">Sisa Tagihan:</span>
                    <span className={`font-bold ${f.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatRupiah(f.balance)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail Folio */}
        <div className="lg:col-span-2 space-y-6">
          {!selectedFolio ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
              Pilih folio di sebelah kiri untuk melihat detail tagihan dan pembayaran.
            </div>
          ) : (
            <>
              {/* Header & Summary */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {selectedFolio.reservation?.guest?.nama} — {selectedFolio.nomorFolio}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Kode Booking: {selectedFolio.reservation?.kodeBooking} · Kamar {selectedFolio.reservation?.room?.nomor || '-'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium cursor-pointer print:hidden"
                  >
                    <Printer className="w-4 h-4" /> Cetak Kuitansi / PDF
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-slate-50">
                    <p className="text-xs text-slate-500">Total Tagihan</p>
                    <p className="text-lg font-bold text-slate-900">{formatRupiah(selectedFolio.totalCharge)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50">
                    <p className="text-xs text-emerald-700">Total Terbayar</p>
                    <p className="text-lg font-bold text-emerald-700">{formatRupiah(selectedFolio.totalPayment)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-indigo-50">
                    <p className="text-xs text-indigo-700">Sisa Tagihan</p>
                    <p className="text-lg font-bold text-indigo-700">{formatRupiah(selectedFolio.balance)}</p>
                  </div>
                </div>
              </div>

              {/* Charges */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h3 className="font-semibold text-sm text-slate-800">Rincian Biaya (Charges)</h3>

                <form onSubmit={handleAddCharge} className="grid grid-cols-1 sm:grid-cols-4 gap-2 print:hidden">
                  <select
                    value={chargeForm.kategori}
                    onChange={(e) => setChargeForm({ ...chargeForm, kategori: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="KAMAR">KAMAR</option>
                    <option value="MAKAN">MAKAN / F&amp;B</option>
                    <option value="LAUNDRY">LAUNDRY</option>
                    <option value="MINIBAR">MINIBAR</option>
                    <option value="PARKIR">PARKIR</option>
                    <option value="LAINNYA">LAINNYA</option>
                  </select>
                  <input
                    type="text"
                    required
                    placeholder="Deskripsi biaya"
                    value={chargeForm.deskripsi}
                    onChange={(e) => setChargeForm({ ...chargeForm, deskripsi: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Nominal (Rp)"
                    value={chargeForm.nominal}
                    onChange={(e) => setChargeForm({ ...chargeForm, nominal: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <button type="submit" className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium cursor-pointer">
                    <Plus className="w-3.5 h-3.5" /> Tambah Biaya
                  </button>
                </form>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="py-2 px-3">Tanggal</th>
                        <th className="py-2 px-3">Kategori</th>
                        <th className="py-2 px-3">Deskripsi</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                        <th className="py-2 px-3 text-right">Pajak+SC</th>
                        <th className="py-2 px-3 text-right">Total</th>
                        <th className="py-2 px-3 print:hidden">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedFolio.charges.map((c) => (
                        <tr key={c.id} className={c.isVoid ? 'opacity-50 line-through bg-red-50/40' : ''}>
                          <td className="py-2 px-3">{formatTanggalPendek(c.tanggal)}</td>
                          <td className="py-2 px-3 font-medium">{c.kategori}</td>
                          <td className="py-2 px-3">
                            {c.deskripsi}
                            {c.isVoid && <span className="block text-[10px] text-red-600 no-underline">VOID: {c.alasanVoid}</span>}
                          </td>
                          <td className="py-2 px-3 text-right">{formatRupiah(c.nominal)}</td>
                          <td className="py-2 px-3 text-right">{formatRupiah(c.pajak + c.serviceCharge)}</td>
                          <td className="py-2 px-3 text-right font-semibold">{formatRupiah(c.total)}</td>
                          <td className="py-2 px-3 print:hidden">
                            {!c.isVoid && (
                              <button
                                type="button"
                                onClick={() => handleVoidCharge(c.id)}
                                className="text-red-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                              >
                                <Ban className="w-3 h-3" /> Void
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payments */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" /> Pembayaran
                </h3>

                <form onSubmit={handleAddPayment} className="grid grid-cols-1 sm:grid-cols-4 gap-2 print:hidden">
                  <select
                    value={payForm.metode}
                    onChange={(e) => setPayForm({ ...payForm, metode: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="TUNAI">TUNAI</option>
                    <option value="TRANSFER">TRANSFER</option>
                    <option value="QRIS">QRIS</option>
                    <option value="KARTU_DEBIT">KARTU DEBIT</option>
                    <option value="KARTU_KREDIT">KARTU KREDIT</option>
                    <option value="DIBAYAR_OTA">DIBAYAR OTA</option>
                    <option value="DEPOSIT">DEPOSIT</option>
                  </select>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Nominal Bayar (Rp)"
                    value={payForm.nominal}
                    onChange={(e) => setPayForm({ ...payForm, nominal: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    placeholder="No. Ref / Keterangan"
                    value={payForm.nomorReferensi}
                    onChange={(e) => setPayForm({ ...payForm, nomorReferensi: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <button type="submit" className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium cursor-pointer">
                    <Plus className="w-3.5 h-3.5" /> Catat Bayar
                  </button>
                </form>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="py-2 px-3">Tanggal</th>
                        <th className="py-2 px-3">Metode</th>
                        <th className="py-2 px-3">Referensi</th>
                        <th className="py-2 px-3 text-right">Nominal</th>
                        <th className="py-2 px-3 print:hidden">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedFolio.payments.map((p) => (
                        <tr key={p.id} className={p.isVoid ? 'opacity-50 line-through bg-red-50/40' : ''}>
                          <td className="py-2 px-3">{formatTanggalPendek(p.tanggal)}</td>
                          <td className="py-2 px-3 font-medium">{p.metode.replace(/_/g, ' ')}</td>
                          <td className="py-2 px-3">
                            {p.nomorReferensi || p.keterangan || '-'}
                            {p.isVoid && <span className="block text-[10px] text-red-600">VOID: {p.alasanVoid}</span>}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-emerald-700">{formatRupiah(p.nominal)}</td>
                          <td className="py-2 px-3 print:hidden">
                            {!p.isVoid && (
                              <button
                                type="button"
                                onClick={() => handleVoidPayment(p.id)}
                                className="text-red-600 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                              >
                                <Ban className="w-3 h-3" /> Void
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
