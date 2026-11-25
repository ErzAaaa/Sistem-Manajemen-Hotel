'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  BedDouble,
  CheckCircle2,
  DoorOpen,
  Layers,
  Plus,
  Users,
  Wrench,
} from 'lucide-react'
import { formatAngka } from '@/lib/format'

type RoomStatus = 'TERSEDIA' | 'TERISI' | 'OUT_OF_ORDER' | 'MAINTENANCE'

interface RoomTypeItem {
  id: string
  nama: string
  kapasitas: number
  fasilitas: string | null
  deskripsi: string | null
  aktif: boolean
  _count?: {
    rooms: number
  }
}

interface RoomItem {
  id: string
  nomor: string
  lantai: number | null
  roomTypeId: string
  roomType: RoomTypeItem
  status: RoomStatus
  aktif: boolean
  catatan: string | null
}

interface KamarSummary {
  total: number
  tersedia: number
  terisi: number
  outOfOrder: number
  kamarTersedia: number
}

const STATUS_OPTIONS: { value: RoomStatus; label: string }[] = [
  { value: 'TERSEDIA', label: 'Tersedia' },
  { value: 'TERISI', label: 'Terisi' },
  { value: 'OUT_OF_ORDER', label: 'Out of Order' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
]

function parseFasilitas(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean)
    }
  } catch {
    // Fallback to comma-separated text
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function getStatusBadgeClass(status: RoomStatus): string {
  switch (status) {
    case 'TERSEDIA':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'TERISI':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200'
    case 'OUT_OF_ORDER':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'MAINTENANCE':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

function getStatusLabel(status: RoomStatus): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status
}

export default function KamarPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const [roomTypes, setRoomTypes] = useState<RoomTypeItem[]>([])
  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [summary, setSummary] = useState<KamarSummary>({
    total: 0,
    tersedia: 0,
    terisi: 0,
    outOfOrder: 0,
    kamarTersedia: 0,
  })

  // Filter unit kamar
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterRoomType, setFilterRoomType] = useState<string>('ALL')

  // Form tambah tipe kamar
  const [rtNama, setRtNama] = useState('')
  const [rtKapasitas, setRtKapasitas] = useState('2')
  const [rtFasilitas, setRtFasilitas] = useState('')
  const [rtDeskripsi, setRtDeskripsi] = useState('')
  const [submittingRt, setSubmittingRt] = useState(false)

  // Form tambah unit kamar
  const [roomNomor, setRoomNomor] = useState('')
  const [roomLantai, setRoomLantai] = useState('')
  const [roomTypeId, setRoomTypeId] = useState('')
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('TERSEDIA')
  const [roomCatatan, setRoomCatatan] = useState('')
  const [submittingRoom, setSubmittingRoom] = useState(false)

  const [updatingRoomId, setUpdatingRoomId] = useState<string | null>(null)

  const fetchKamar = useCallback(async () => {
    try {
      const res = await fetch('/api/kamar')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Gagal memuat data kamar.')
        return
      }
      const nextRoomTypes: RoomTypeItem[] = Array.isArray(data.roomTypes)
        ? data.roomTypes
        : []
      setRoomTypes(nextRoomTypes)
      setRooms(Array.isArray(data.rooms) ? data.rooms : [])
      if (data.summary) {
        setSummary(data.summary)
      }
      setRoomTypeId((prev) => prev || nextRoomTypes[0]?.id || '')
      setError('')
    } catch {
      setError('Gagal terhubung ke server.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKamar()
  }, [fetchKamar])

  async function handleAddRoomType(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    setSubmittingRt(true)

    try {
      const fasilitasList = rtFasilitas
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

      const res = await fetch('/api/kamar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'roomType',
          nama: rtNama,
          kapasitas: Number(rtKapasitas),
          fasilitas: fasilitasList,
          deskripsi: rtDeskripsi,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFeedback({
          type: 'error',
          text: data.error || 'Gagal menambahkan tipe kamar.',
        })
        return
      }

      setRtNama('')
      setRtKapasitas('2')
      setRtFasilitas('')
      setRtDeskripsi('')
      setFeedback({
        type: 'success',
        text: `Tipe kamar "${data.roomType?.nama ?? rtNama}" berhasil ditambahkan.`,
      })
      await fetchKamar()
    } catch {
      setFeedback({
        type: 'error',
        text: 'Terjadi kesalahan jaringan saat menambah tipe kamar.',
      })
    } finally {
      setSubmittingRt(false)
    }
  }

  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    setSubmittingRoom(true)

    try {
      const res = await fetch('/api/kamar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomor: roomNomor,
          lantai: roomLantai ? Number(roomLantai) : null,
          roomTypeId,
          status: roomStatus,
          catatan: roomCatatan,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFeedback({
          type: 'error',
          text: data.error || 'Gagal menambahkan unit kamar.',
        })
        return
      }

      setRoomNomor('')
      setRoomLantai('')
      setRoomStatus('TERSEDIA')
      setRoomCatatan('')
      setFeedback({
        type: 'success',
        text: `Kamar nomor ${data.room?.nomor ?? roomNomor} berhasil ditambahkan.`,
      })
      await fetchKamar()
    } catch {
      setFeedback({
        type: 'error',
        text: 'Terjadi kesalahan jaringan saat menambah kamar.',
      })
    } finally {
      setSubmittingRoom(false)
    }
  }

  async function handleStatusChange(roomId: string, nextStatus: RoomStatus) {
    setFeedback(null)
    setUpdatingRoomId(roomId)

    try {
      const res = await fetch(`/api/kamar/${roomId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()

      if (!res.ok) {
        setFeedback({
          type: 'error',
          text: data.error || 'Gagal memperbarui status kamar.',
        })
        return
      }

      setFeedback({
        type: 'success',
        text: `Status kamar ${data.room?.nomor ?? ''} diubah menjadi ${getStatusLabel(nextStatus)}.`,
      })
      await fetchKamar()
    } catch {
      setFeedback({
        type: 'error',
        text: 'Terjadi kesalahan jaringan saat memperbarui status kamar.',
      })
    } finally {
      setUpdatingRoomId(null)
    }
  }

  const filteredRooms = rooms.filter((room) => {
    if (filterStatus !== 'ALL' && room.status !== filterStatus) return false
    if (filterRoomType !== 'ALL' && room.roomTypeId !== filterRoomType) return false
    return true
  })

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-8 w-56 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 bg-white rounded-xl border border-slate-200 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <BedDouble className="w-6 h-6 text-indigo-600" />
          <span>Master Kamar</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Kelola tipe kamar, daftar unit kamar, dan status kesiapan kamar secara real-time.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-center gap-2 p-3.5 rounded-xl text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase">
              Total Kamar
            </span>
            <BedDouble className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {formatAngka(summary.total)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {roomTypes.length} tipe kamar terdaftar
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-700 uppercase">
              Kamar Tersedia
            </span>
            <DoorOpen className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2">
            {formatAngka(summary.kamarTersedia)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Aktif dikurangi OOO ({formatAngka(summary.tersedia)} siap huni)
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-indigo-700 uppercase">
              Terisi
            </span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-indigo-700 mt-2">
            {formatAngka(summary.terisi)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Sedang digunakan tamu</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-red-700 uppercase">
              Out of Order
            </span>
            <Wrench className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-700 mt-2">
            {formatAngka(summary.outOfOrder)}
          </p>
          <p className="text-xs text-slate-500 mt-1">OOO &amp; Maintenance</p>
        </div>
      </div>

      {/* Section Tipe Kamar */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-slate-900">Daftar Tipe Kamar</h2>
            </div>
            <span className="text-xs text-slate-500">{roomTypes.length} tipe</span>
          </div>

          {roomTypes.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Belum ada tipe kamar. Silakan tambahkan tipe kamar baru.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {roomTypes.map((rt) => {
                const fasilitas = parseFasilitas(rt.fasilitas)
                return (
                  <div
                    key={rt.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:bg-slate-50/60"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{rt.nama}</h3>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          <Users className="w-3 h-3" />
                          <span>Maks {rt.kapasitas} tamu</span>
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {rt._count?.rooms ?? 0} unit
                        </span>
                      </div>
                      {rt.deskripsi && (
                        <p className="text-xs text-slate-600">{rt.deskripsi}</p>
                      )}
                      {fasilitas.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {fasilitas.map((fas, idx) => (
                            <span
                              key={`${rt.id}-${idx}`}
                              className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs"
                            >
                              {fas}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Form Tambah Tipe Kamar */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50/70">
            <Plus className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Tambah Tipe Kamar</h2>
          </div>

          <form onSubmit={handleAddRoomType} className="p-5 space-y-3.5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nama Tipe <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={rtNama}
                onChange={(e) => setRtNama(e.target.value)}
                placeholder="Contoh: Executive Suite"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Kapasitas (Orang) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={rtKapasitas}
                onChange={(e) => setRtKapasitas(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Fasilitas (pisahkan dengan koma)
              </label>
              <input
                type="text"
                value={rtFasilitas}
                onChange={(e) => setRtFasilitas(e.target.value)}
                placeholder="AC, TV, WiFi, Sarapan"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Deskripsi
              </label>
              <textarea
                rows={2}
                value={rtDeskripsi}
                onChange={(e) => setRtDeskripsi(e.target.value)}
                placeholder="Keterangan singkat tipe kamar"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={submittingRt}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{submittingRt ? 'Menambahkan...' : 'Tambah Tipe Kamar'}</span>
            </button>
          </form>
        </div>
      </section>

      {/* Section Daftar Unit Kamar & Tambah Kamar */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <BedDouble className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-slate-900">Daftar Unit Kamar</h2>
              <span className="text-xs text-slate-500">
                ({filteredRooms.length} dari {rooms.length})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterRoomType}
                onChange={(e) => setFilterRoomType(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Semua Tipe</option>
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.nama}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Semua Status</option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredRooms.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Tidak ada unit kamar yang sesuai filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Nomor</th>
                    <th className="px-5 py-3 font-semibold">Lantai</th>
                    <th className="px-5 py-3 font-semibold">Tipe Kamar</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Ubah Status Cepat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRooms.map((room) => (
                    <tr key={room.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-semibold text-slate-900">
                        <div>{room.nomor}</div>
                        {room.catatan && (
                          <div className="text-xs font-normal text-slate-500">
                            {room.catatan}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {room.lantai !== null ? `Lantai ${room.lantai}` : '-'}
                      </td>
                      <td className="px-5 py-3 text-slate-800">
                        {room.roomType?.nama ?? '-'}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(
                            room.status
                          )}`}
                        >
                          {getStatusLabel(room.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          aria-label={`Ubah status kamar ${room.nomor}`}
                          disabled={updatingRoomId === room.id}
                          value={room.status}
                          onChange={(e) =>
                            handleStatusChange(room.id, e.target.value as RoomStatus)
                          }
                          className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Form Tambah Unit Kamar */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50/70">
            <Plus className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Tambah Unit Kamar</h2>
          </div>

          <form onSubmit={handleAddRoom} className="p-5 space-y-3.5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nomor Kamar <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={roomNomor}
                onChange={(e) => setRoomNomor(e.target.value)}
                placeholder="Contoh: 106"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Lantai
              </label>
              <input
                type="number"
                value={roomLantai}
                onChange={(e) => setRoomLantai(e.target.value)}
                placeholder="Contoh: 1"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tipe Kamar <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={roomTypeId}
                onChange={(e) => setRoomTypeId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="" disabled>
                  Pilih tipe kamar
                </option>
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.nama} (Maks {rt.kapasitas} tamu)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Status Awal
              </label>
              <select
                value={roomStatus}
                onChange={(e) => setRoomStatus(e.target.value as RoomStatus)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Catatan
              </label>
              <input
                type="text"
                value={roomCatatan}
                onChange={(e) => setRoomCatatan(e.target.value)}
                placeholder="Catatan opsional"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={submittingRoom || roomTypes.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{submittingRoom ? 'Menambahkan...' : 'Tambah Unit Kamar'}</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
