'use client'

import { useEffect, useState } from 'react'
import { Users, UserPlus, Download, Search, Star, Ban, History, Edit3, X, AlertTriangle } from 'lucide-react'
import { formatTanggalPendek, formatRupiah } from '@/lib/format'
import {
  MAX_GUEST_ADDRESS_LENGTH,
  formatGuestAddress,
  validateGuestAddress,
} from '@/lib/guest-validation'

interface GuestItem {
  id: string
  nama: string
  telepon: string | null
  email: string | null
  jenisIdentitas: string | null
  nomorIdentitas: string | null
  kewarganegaraan: string
  kotaAsal: string | null
  alamat: string | null
  flagVip: boolean
  flagBlacklist: boolean
  catatan: string | null
  persetujuanPrivasi: boolean
  _count?: { reservations: number }
}

interface GuestDetail extends GuestItem {
  reservations: {
    id: string
    kodeBooking: string
    tanggalCheckIn: string
    tanggalCheckOut: string
    status: string
    totalKeseluruhan: number
    sumberBooking: string
    room: { nomor: string } | null
  }[]
}

export default function TamuPage() {
  const [guests, setGuests] = useState<GuestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filterWna, setFilterWna] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingGuest, setEditingGuest] = useState<GuestItem | null>(null)
  const [duplicateWarn, setDuplicateWarn] = useState<GuestItem | null>(null)
  const [detailGuest, setDetailGuest] = useState<GuestDetail | null>(null)
  const [err, setErr] = useState('')

  const [form, setForm] = useState({
    nama: '',
    telepon: '',
    email: '',
    jenisIdentitas: 'KTP',
    nomorIdentitas: '',
    kewarganegaraan: 'WNI',
    kotaAsal: '',
    alamat: '',
    flagVip: false,
    flagBlacklist: false,
    catatan: '',
    persetujuanPrivasi: true,
  })

  async function loadGuests() {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (filterWna) params.set('kewarganegaraan', filterWna)
    const res = await fetch(`/api/tamu?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      setGuests(data.guests || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadGuests()
  }, [filterWna])

  function openAddModal() {
    setEditingGuest(null)
    setDuplicateWarn(null)
    setErr('')
    setForm({
      nama: '',
      telepon: '',
      email: '',
      jenisIdentitas: 'KTP',
      nomorIdentitas: '',
      kewarganegaraan: 'WNI',
      kotaAsal: '',
      alamat: '',
      flagVip: false,
      flagBlacklist: false,
      catatan: '',
      persetujuanPrivasi: true,
    })
    setShowModal(true)
  }

  function openEditModal(guest: GuestItem) {
    setEditingGuest(guest)
    setDuplicateWarn(null)
    setErr('')
    setForm({
      nama: guest.nama,
      telepon: guest.telepon || '',
      email: guest.email || '',
      jenisIdentitas: guest.jenisIdentitas || 'KTP',
      nomorIdentitas: guest.nomorIdentitas || '',
      kewarganegaraan: guest.kewarganegaraan || 'WNI',
      kotaAsal: guest.kotaAsal || '',
      alamat: guest.alamat || '',
      flagVip: guest.flagVip,
      flagBlacklist: guest.flagBlacklist,
      catatan: guest.catatan || '',
      persetujuanPrivasi: guest.persetujuanPrivasi,
    })
    setShowModal(true)
  }

  async function submitGuest(forceCreate = false) {
    setErr('')
    const addressCheck = validateGuestAddress(form.alamat, { required: false })
    if (!addressCheck.valid) {
      setErr(addressCheck.error)
      return
    }

    if (editingGuest) {
      const res = await fetch(`/api/tamu/${editingGuest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, alamat: addressCheck.value }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error || 'Gagal memperbarui data tamu')
        return
      }
      const updatedId = editingGuest.id
      setEditingGuest(null)
      setShowModal(false)
      await loadGuests()
      if (detailGuest?.id === updatedId) {
        await openDetail(updatedId)
      }
      return
    }

    const res = await fetch('/api/tamu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, alamat: addressCheck.value, forceCreate }),
    })
    const data = await res.json()
    if (res.status === 409 && data.duplicate) {
      setDuplicateWarn(data.duplicate)
      return
    }
    if (!res.ok) {
      setErr(data.error || 'Gagal menyimpan data tamu')
      return
    }
    setDuplicateWarn(null)
    setShowModal(false)
    setForm({
      nama: '',
      telepon: '',
      email: '',
      jenisIdentitas: 'KTP',
      nomorIdentitas: '',
      kewarganegaraan: 'WNI',
      kotaAsal: '',
      alamat: '',
      flagVip: false,
      flagBlacklist: false,
      catatan: '',
      persetujuanPrivasi: true,
    })
    await loadGuests()
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/tamu/${id}`)
    if (res.ok) {
      const data = await res.json()
      setDetailGuest(data.guest)
    }
  }

  function exportApoaCsv() {
    const wna = guests.filter((g) => g.kewarganegaraan === 'WNA')
    const rows = [
      ['Nama', 'Kewarganegaraan', 'Jenis Identitas', 'Nomor (Masked)', 'Telepon', 'Email', 'Kota/Negara Asal', 'Alamat'],
      ...wna.map((g) => [
        g.nama,
        g.kewarganegaraan,
        g.jenisIdentitas || '',
        g.nomorIdentitas || '',
        g.telepon || '',
        g.email || '',
        g.kotaAsal || '',
        formatGuestAddress(g.alamat),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `apoa-tamu-wna-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalWna = guests.filter((g) => g.kewarganegaraan === 'WNA').length
  const totalVip = guests.filter((g) => g.flagVip).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Tamu &amp; Pengunjung</h1>
          <p className="text-sm text-slate-500">Profil tamu, perlindungan privasi (enkripsi + masking), riwayat menginap &amp; ekspor APOA</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportApoaCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Ekspor WNA (APOA)
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> Tambah Tamu
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs text-slate-500">Total Profil Tamu</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{guests.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs text-slate-500">Tamu Asing (WNA / APOA)</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{totalWna}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs text-slate-500">Tamu VIP</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{totalVip}</p>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form
          onSubmit={(e) => { e.preventDefault(); loadGuests() }}
          className="flex-1 flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama, telepon, email, kota asal, atau alamat..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium cursor-pointer">
            Cari
          </button>
        </form>
        <select
          value={filterWna}
          onChange={(e) => setFilterWna(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">Semua Kewarganegaraan</option>
          <option value="WNI">WNI</option>
          <option value="WNA">WNA (Asing)</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Memuat data tamu...</div>
        ) : guests.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            Belum ada data tamu.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 text-xs">
                <tr>
                  <th className="py-3 px-4">Nama Tamu</th>
                  <th className="py-3 px-4">Kontak</th>
                  <th className="py-3 px-4">Identitas (Masked)</th>
                  <th className="py-3 px-4">Asal</th>
                  <th className="py-3 px-4">Alamat</th>
                  <th className="py-3 px-4">Menginap</th>
                  <th className="py-3 px-4">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {guests.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 flex items-center gap-1.5">
                        <span>{g.nama}</span>
                        {g.flagVip && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                        {g.flagBlacklist && <Ban className="w-3.5 h-3.5 text-red-500" />}
                      </div>
                      <span className="text-xs text-slate-400">{g.kewarganegaraan}</span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div>{g.telepon || '-'}</div>
                      <div className="text-slate-400">{g.email || ''}</div>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-700">
                      {g.jenisIdentitas ? `${g.jenisIdentitas}: ${g.nomorIdentitas || '-'}` : '-'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{g.kotaAsal || '-'}</td>
                    <td
                      className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate"
                      title={g.alamat || undefined}
                    >
                      {formatGuestAddress(g.alamat)}
                    </td>
                    <td className="py-3 px-4 text-xs">{g._count?.reservations ?? 0} kali</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openEditModal(g)}
                          className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-indigo-600 hover:underline cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openDetail(g.id)}
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5" /> Riwayat
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tambah / Edit Tamu */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="font-bold text-slate-900">
                {editingGuest ? 'Edit Data Tamu' : 'Registrasi Tamu Baru'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false)
                  setEditingGuest(null)
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {err && <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{err}</div>}

            {duplicateWarn && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Potensi Tamu Duplikat Ditemukan: {duplicateWarn.nama} ({duplicateWarn.telepon})</span>
                </div>
                <button
                  type="button"
                  onClick={() => submitGuest(true)}
                  className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs font-medium cursor-pointer"
                >
                  Tetap Simpan Sebagai Tamu Baru
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => { e.preventDefault(); submitGuest(false) }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={form.nama}
                  onChange={(e) => setForm({ ...form, nama: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">No. Telepon / WA</label>
                  <input
                    type="text"
                    value={form.telepon}
                    onChange={(e) => setForm({ ...form, telepon: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Jenis ID</label>
                  <select
                    value={form.jenisIdentitas}
                    onChange={(e) => setForm({ ...form, jenisIdentitas: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="KTP">KTP</option>
                    <option value="PASPOR">PASPOR</option>
                    <option value="SIM">SIM</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nomor Identitas (Terenkripsi)</label>
                  <input
                    type="text"
                    value={form.nomorIdentitas}
                    onChange={(e) => setForm({ ...form, nomorIdentitas: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kewarganegaraan</label>
                  <select
                    value={form.kewarganegaraan}
                    onChange={(e) => setForm({ ...form, kewarganegaraan: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="WNI">WNI</option>
                    <option value="WNA">WNA</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kota / Negara Asal</label>
                  <input
                    type="text"
                    value={form.kotaAsal}
                    onChange={(e) => setForm({ ...form, kotaAsal: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Alamat (Satu Baris, Maks. {MAX_GUEST_ADDRESS_LENGTH} Karakter)
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {form.alamat.length}/{MAX_GUEST_ADDRESS_LENGTH}
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={MAX_GUEST_ADDRESS_LENGTH}
                  value={form.alamat}
                  onChange={(e) =>
                    setForm({ ...form, alamat: e.target.value.replace(/[\r\n]+/g, ' ') })
                  }
                  placeholder="Contoh: Jl. Pahlawan No. 10, Kec. Taman, Kota Madiun"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Wajib diisi saat tamu melakukan check-in.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 pt-1 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={form.flagVip} onChange={(e) => setForm({ ...form, flagVip: e.target.checked })} />
                  <span>Tandai VIP</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={form.flagBlacklist} onChange={(e) => setForm({ ...form, flagBlacklist: e.target.checked })} />
                  <span className="text-red-600">Blacklist</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" required checked={form.persetujuanPrivasi} onChange={(e) => setForm({ ...form, persetujuanPrivasi: e.target.checked })} />
                  <span>Persetujuan Privasi (UU PDP)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditingGuest(null)
                  }}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium cursor-pointer">
                  {editingGuest ? 'Simpan Perubahan' : 'Simpan Tamu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Riwayat Tamu */}
      {detailGuest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b pb-3 gap-3">
              <div>
                <h2 className="font-bold text-slate-900">{detailGuest.nama}</h2>
                <p className="text-xs text-slate-500">{detailGuest.telepon || '-'} · {detailGuest.kotaAsal || '-'}</p>
                <p className="text-xs text-slate-600 mt-1">
                  <span className="font-medium text-slate-700">Alamat:</span>{' '}
                  {formatGuestAddress(detailGuest.alamat)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(detailGuest)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
                <button type="button" onClick={() => setDetailGuest(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-slate-800">Riwayat Menginap</h3>
            {detailGuest.reservations?.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada riwayat reservasi.</p>
            ) : (
              <div className="space-y-2">
                {detailGuest.reservations.map((r) => (
                  <div key={r.id} className="p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-semibold">{r.kodeBooking} — Kamar {r.room?.nomor || '-'}</p>
                      <p className="text-slate-500">
                        {formatTanggalPendek(r.tanggalCheckIn)} s/d {formatTanggalPendek(r.tanggalCheckOut)} ({r.sumberBooking})
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-medium">{r.status}</span>
                      <p className="font-semibold mt-1">{formatRupiah(r.totalKeseluruhan)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
