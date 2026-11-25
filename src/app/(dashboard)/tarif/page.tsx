'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Calculator,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Edit3,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Tag,
  X,
} from 'lucide-react'
import { formatRupiah, formatTanggalPendek } from '@/lib/format'

interface RoomType {
  id: string
  nama: string
  kapasitas: number
  aktif: boolean
}

interface RateCalendar {
  id: string
  ratePlanId: string
  tanggal: string
  kelasMusim: string
  tarifOverride: number | null
  aktif: boolean
}

interface RatePlan {
  id: string
  nama: string
  roomTypeId: string
  roomType: RoomType
  tarifDasar: number
  sumber: string
  inklusi: string | null
  aktif: boolean
  rateCalendars: RateCalendar[]
}

interface NightBreakdown {
  tanggal: string
  kelasMusim: string
  tarif: number
  isOverride: boolean
}

interface PricePreview {
  ratePlanId: string
  ratePlanNama: string
  roomTypeId: string
  checkIn: string
  checkOut: string
  jumlahMalam: number
  tarifDasar: number
  tarifRataRata: number
  baseTotal: number
  pajakDaerahPct: number
  serviceChargePct: number
  modeHarga: 'INCLUSIVE' | 'EXCLUSIVE'
  subtotal: number
  serviceCharge: number
  pajak: number
  total: number
  rincianPerMalam: NightBreakdown[]
}

const SUMBER_OPTIONS = [
  { value: 'UMUM', label: 'Umum (Walk-In / Langsung)' },
  { value: 'OTA', label: 'OTA (Online Travel Agent)' },
  { value: 'KORPORAT', label: 'Korporat' },
  { value: 'LONG_STAY', label: 'Long Stay' },
]

const KELAS_MUSIM_OPTIONS = [
  { value: 'NORMAL', label: 'Normal', badge: 'bg-slate-100 text-slate-700' },
  { value: 'WEEKEND', label: 'Akhir Pekan (Weekend)', badge: 'bg-blue-100 text-blue-700' },
  { value: 'HIGH_SEASON', label: 'High Season', badge: 'bg-amber-100 text-amber-800' },
  { value: 'LIBUR', label: 'Hari Libur Nasional', badge: 'bg-rose-100 text-rose-700' },
]

function parseInklusi(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean)
    }
  } catch {
    // Fallback untuk string dipisahkan koma
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatInklusiForInput(raw: string | null): string {
  return parseInklusi(raw).join(', ')
}

function getKelasMusimMeta(value: string) {
  return (
    KELAS_MUSIM_OPTIONS.find((opt) => opt.value === value) ?? {
      value,
      label: value,
      badge: 'bg-slate-100 text-slate-700',
    }
  )
}

function getSumberLabel(value: string): string {
  const found = SUMBER_OPTIONS.find((opt) => opt.value === value)
  return found ? found.value : value
}

function getTodayDateString(offsetDays = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function TarifPage() {
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([])
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Form tambah Rate Plan
  const [newNama, setNewNama] = useState('')
  const [newRoomTypeId, setNewRoomTypeId] = useState('')
  const [newTarifDasar, setNewTarifDasar] = useState('')
  const [newSumber, setNewSumber] = useState('UMUM')
  const [newInklusi, setNewInklusi] = useState('Sarapan')
  const [submittingPlan, setSubmittingPlan] = useState(false)

  // Modal edit Rate Plan
  const [editingPlan, setEditingPlan] = useState<RatePlan | null>(null)
  const [editNama, setEditNama] = useState('')
  const [editTarifDasar, setEditTarifDasar] = useState('')
  const [editSumber, setEditSumber] = useState('UMUM')
  const [editInklusi, setEditInklusi] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Form Kalender Tarif (Musiman)
  const [calRatePlanId, setCalRatePlanId] = useState('')
  const [calTanggal, setCalTanggal] = useState(getTodayDateString(0))
  const [calKelasMusim, setCalKelasMusim] = useState('HIGH_SEASON')
  const [calTarifOverride, setCalTarifOverride] = useState('')
  const [submittingCal, setSubmittingCal] = useState(false)
  const [calFilterPlanId, setCalFilterPlanId] = useState('ALL')

  // Simulasi / Kalkulator Harga
  const [simRatePlanId, setSimRatePlanId] = useState('')
  const [simCheckIn, setSimCheckIn] = useState(getTodayDateString(0))
  const [simCheckOut, setSimCheckOut] = useState(getTodayDateString(2))
  const [simulating, setSimulating] = useState(false)
  const [pricePreview, setPricePreview] = useState<PricePreview | null>(null)
  const [simError, setSimError] = useState('')

  const fetchTarifData = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/tarif')
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal memuat data tarif')
        return
      }
      const fetchedPlans: RatePlan[] = data.ratePlans || []
      const fetchedTypes: RoomType[] = data.roomTypes || []
      setRatePlans(fetchedPlans)
      setRoomTypes(fetchedTypes)

      if (fetchedTypes.length > 0) {
        setNewRoomTypeId((prev) => prev || fetchedTypes[0].id)
      }
      if (fetchedPlans.length > 0) {
        setCalRatePlanId((prev) => prev || fetchedPlans[0].id)
        setSimRatePlanId((prev) => prev || fetchedPlans[0].id)
      }
    } catch {
      setErrorMsg('Gagal terhubung ke server saat memuat data tarif')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTarifData()
  }, [fetchTarifData])

  const allCalendarOverrides = useMemo(() => {
    const items = ratePlans.flatMap((plan) =>
      (plan.rateCalendars || [])
        .filter((cal) => cal.aktif)
        .map((cal) => ({
          ...cal,
          ratePlanNama: plan.nama,
          roomTypeNama: plan.roomType?.nama || '-',
          tarifDasar: plan.tarifDasar,
        }))
    )

    const filtered =
      calFilterPlanId === 'ALL'
        ? items
        : items.filter((item) => item.ratePlanId === calFilterPlanId)

    return filtered.sort((a, b) => a.tanggal.localeCompare(b.tanggal))
  }, [ratePlans, calFilterPlanId])

  async function handleCreateRatePlan(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setSubmittingPlan(true)

    try {
      const inklusiList = newInklusi
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const res = await fetch('/api/tarif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: newNama.trim(),
          roomTypeId: newRoomTypeId,
          tarifDasar: Number(newTarifDasar),
          sumber: newSumber,
          inklusi: inklusiList.length > 0 ? inklusiList : null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menambah rate plan')
        return
      }

      setSuccessMsg(`Rate plan "${data.ratePlan.nama}" berhasil ditambahkan.`)
      setNewNama('')
      setNewTarifDasar('')
      setNewInklusi('Sarapan')
      await fetchTarifData()
    } catch {
      setErrorMsg('Gagal terhubung ke server saat menyimpan rate plan')
    } finally {
      setSubmittingPlan(false)
    }
  }

  function openEditModal(plan: RatePlan) {
    setEditingPlan(plan)
    setEditNama(plan.nama)
    setEditTarifDasar(String(plan.tarifDasar))
    setEditSumber(plan.sumber)
    setEditInklusi(formatInklusiForInput(plan.inklusi))
    setErrorMsg('')
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingPlan) return
    setErrorMsg('')
    setSuccessMsg('')
    setSavingEdit(true)

    try {
      const inklusiList = editInklusi
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const res = await fetch(`/api/tarif/${editingPlan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: editNama.trim(),
          tarifDasar: Number(editTarifDasar),
          sumber: editSumber,
          inklusi: inklusiList.length > 0 ? inklusiList : null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal memperbarui rate plan')
        return
      }

      setSuccessMsg(`Rate plan "${data.ratePlan.nama}" berhasil diperbarui.`)
      setEditingPlan(null)
      await fetchTarifData()
    } catch {
      setErrorMsg('Gagal terhubung ke server saat memperbarui rate plan')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleToggleActive(plan: RatePlan) {
    setErrorMsg('')
    setSuccessMsg('')
    setTogglingId(plan.id)

    try {
      const res = await fetch(`/api/tarif/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktif: !plan.aktif }),
      })

      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal mengubah status rate plan')
        return
      }

      setSuccessMsg(
        `Rate plan "${plan.nama}" sekarang ${data.ratePlan.aktif ? 'Aktif' : 'Nonaktif'}.`
      )
      await fetchTarifData()
    } catch {
      setErrorMsg('Gagal terhubung ke server saat mengubah status')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleSaveCalendar(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setSubmittingCal(true)

    try {
      const res = await fetch('/api/tarif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'calendar',
          ratePlanId: calRatePlanId,
          tanggal: calTanggal,
          kelasMusim: calKelasMusim,
          tarifOverride: calTarifOverride === '' ? null : Number(calTarifOverride),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Gagal menyimpan kalender tarif')
        return
      }

      setSuccessMsg(
        `Kalender tarif tanggal ${formatTanggalPendek(calTanggal)} berhasil disimpan.`
      )
      setCalTarifOverride('')
      await fetchTarifData()
    } catch {
      setErrorMsg('Gagal terhubung ke server saat menyimpan kalender tarif')
    } finally {
      setSubmittingCal(false)
    }
  }

  async function handleSimulatePrice(e: React.FormEvent) {
    e.preventDefault()
    setSimError('')
    setPricePreview(null)

    if (!simRatePlanId || !simCheckIn || !simCheckOut) {
      setSimError('Pilih rate plan serta tanggal check-in dan check-out terlebih dahulu.')
      return
    }

    setSimulating(true)
    try {
      const params = new URLSearchParams({
        ratePlanId: simRatePlanId,
        checkIn: simCheckIn,
        checkOut: simCheckOut,
      })
      const res = await fetch(`/api/tarif?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        setSimError(data.error || 'Gagal menghitung simulasi harga')
        return
      }
      setPricePreview(data.pricePreview || null)
    } catch {
      setSimError('Gagal terhubung ke server saat menghitung simulasi')
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <CreditCard className="w-6 h-6 text-indigo-600" />
            <span>Manajemen Tarif &amp; Rate Plan</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Atur paket tarif kamar, kalender tarif musiman, dan simulasi perhitungan pajak &amp; service charge.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchTarifData}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Feedback Alerts */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMsg}</div>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="text-red-500 hover:text-red-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">{successMsg}</div>
          <button
            type="button"
            onClick={() => setSuccessMsg('')}
            className="text-emerald-500 hover:text-emerald-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: Rate Plan */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Tag className="w-5 h-5 text-indigo-600" />
              <span>Daftar Rate Plan</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola tarif dasar per tipe kamar dan saluran penjualan (Umum, OTA, Korporat, Long Stay).
            </p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 self-start sm:self-auto">
            Total: {ratePlans.length} Rate Plan
          </span>
        </div>

        {/* Form Tambah Rate Plan */}
        <form
          onSubmit={handleCreateRatePlan}
          className="p-5 bg-slate-50/70 border-b border-slate-200"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Tambah Rate Plan Baru
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Rate Plan <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newNama}
                onChange={(e) => setNewNama(e.target.value)}
                placeholder="Contoh: Deluxe - Promo Akhir Pekan"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tipe Kamar <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={newRoomTypeId}
                onChange={(e) => setNewRoomTypeId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {roomTypes.length === 0 && <option value="">Belum ada tipe kamar</option>}
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.nama}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tarif Dasar (Rp) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                required
                value={newTarifDasar}
                onChange={(e) => setNewTarifDasar(e.target.value)}
                placeholder="500000"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Sumber</label>
              <select
                value={newSumber}
                onChange={(e) => setNewSumber(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {SUMBER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Inklusi (pisah koma)
              </label>
              <input
                type="text"
                value={newInklusi}
                onChange={(e) => setNewInklusi(e.target.value)}
                placeholder="Sarapan, WiFi"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={submittingPlan || roomTypes.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium transition cursor-pointer"
            >
              {submittingPlan ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>{submittingPlan ? 'Menyimpan...' : 'Tambah Rate Plan'}</span>
            </button>
          </div>
        </form>

        {/* Tabel Rate Plan */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Nama Rate Plan</th>
                <th className="px-4 py-3 font-semibold">Tipe Kamar</th>
                <th className="px-4 py-3 font-semibold">Tarif Dasar</th>
                <th className="px-4 py-3 font-semibold">Sumber</th>
                <th className="px-4 py-3 font-semibold">Inklusi</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Memuat daftar rate plan...
                  </td>
                </tr>
              ) : ratePlans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Belum ada rate plan terdaftar. Tambahkan rate plan baru di atas.
                  </td>
                </tr>
              ) : (
                ratePlans.map((plan) => {
                  const inklusiItems = parseInklusi(plan.inklusi)
                  return (
                    <tr
                      key={plan.id}
                      className={`hover:bg-slate-50/80 ${!plan.aktif ? 'opacity-65 bg-slate-50/40' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">{plan.nama}</td>
                      <td className="px-4 py-3 text-slate-700">{plan.roomType?.nama || '-'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                        {formatRupiah(plan.tarifDasar)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700">
                          {getSumberLabel(plan.sumber)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {inklusiItems.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {inklusiItems.map((inc, idx) => (
                              <span
                                key={idx}
                                className="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs"
                              >
                                {inc}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            plan.aktif
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {plan.aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(plan)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            disabled={togglingId === plan.id}
                            onClick={() => handleToggleActive(plan)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
                              plan.aktif
                                ? 'border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800'
                                : 'border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{plan.aktif ? 'Nonaktifkan' : 'Aktifkan'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 2 & 3 Grid: Kalender Tarif (Musiman) & Simulasi Harga */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Kalender Tarif (Musiman) */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-indigo-600" />
              <span>Kalender Tarif (Musiman)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tetapkan tarif override khusus pada tanggal tertentu (Akhir Pekan, High Season, atau Hari Libur).
            </p>
          </div>

          <form
            onSubmit={handleSaveCalendar}
            className="p-5 bg-slate-50/70 border-b border-slate-200 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Rate Plan <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={calRatePlanId}
                  onChange={(e) => setCalRatePlanId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {ratePlans.length === 0 && <option value="">Belum ada rate plan</option>}
                  {ratePlans.map((rp) => (
                    <option key={rp.id} value={rp.id}>
                      {rp.nama} ({formatRupiah(rp.tarifDasar)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tanggal <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={calTanggal}
                  onChange={(e) => setCalTanggal(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kelas Musim
                </label>
                <select
                  value={calKelasMusim}
                  onChange={(e) => setCalKelasMusim(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {KELAS_MUSIM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tarif Override (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={calTarifOverride}
                  onChange={(e) => setCalTarifOverride(e.target.value)}
                  placeholder="Kosongkan jika pakai tarif dasar"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submittingCal || ratePlans.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium transition cursor-pointer"
              >
                {submittingCal && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{submittingCal ? 'Menyimpan...' : 'Simpan Override Kalender'}</span>
              </button>
            </div>
          </form>

          {/* Filter & Tabel Override Aktif */}
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700">
              Daftar Override Kalender Aktif ({allCalendarOverrides.length})
            </p>
            <select
              value={calFilterPlanId}
              onChange={(e) => setCalFilterPlanId(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
            >
              <option value="ALL">Semua Rate Plan</option>
              {ratePlans.map((rp) => (
                <option key={rp.id} value={rp.id}>
                  {rp.nama}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Tanggal</th>
                  <th className="px-4 py-2.5 font-semibold">Rate Plan</th>
                  <th className="px-4 py-2.5 font-semibold">Kelas Musim</th>
                  <th className="px-4 py-2.5 font-semibold">Tarif Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {allCalendarOverrides.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-xs">
                      Belum ada override kalender aktif.
                    </td>
                  </tr>
                ) : (
                  allCalendarOverrides.map((item) => {
                    const meta = getKelasMusimMeta(item.kelasMusim)
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => {
                          setCalRatePlanId(item.ratePlanId)
                          setCalTanggal(item.tanggal.slice(0, 10))
                          setCalKelasMusim(item.kelasMusim)
                          setCalTarifOverride(
                            item.tarifOverride !== null ? String(item.tarifOverride) : ''
                          )
                        }}
                        title="Klik untuk mengisi ulang form override"
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap font-medium text-slate-900">
                          {formatTanggalPendek(item.tanggal)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-slate-800 font-medium">{item.ratePlanNama}</div>
                          <div className="text-xs text-slate-400">
                            Dasar: {formatRupiah(item.tarifDasar)}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-indigo-700 whitespace-nowrap">
                          {item.tarifOverride !== null
                            ? formatRupiah(item.tarifOverride)
                            : `${formatRupiah(item.tarifDasar)} (Dasar)`}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION 3: Simulasi / Kalkulator Harga */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-indigo-600" />
              <span>Simulasi &amp; Kalkulator Harga</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Hitung estimasi biaya menginap beserta override kalender, Service Charge, dan Pajak Daerah.
            </p>
          </div>

          <form onSubmit={handleSimulatePrice} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Pilih Rate Plan <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={simRatePlanId}
                onChange={(e) => setSimRatePlanId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {ratePlans.length === 0 && <option value="">Belum ada rate plan</option>}
                {ratePlans.map((rp) => (
                  <option key={rp.id} value={rp.id}>
                    {rp.nama} — {formatRupiah(rp.tarifDasar)}/malam {!rp.aktif ? '(Nonaktif)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tanggal Check-In <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={simCheckIn}
                  onChange={(e) => setSimCheckIn(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tanggal Check-Out <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={simCheckOut}
                  onChange={(e) => setSimCheckOut(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={simulating || ratePlans.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium transition cursor-pointer"
            >
              {simulating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Calculator className="w-4 h-4" />
              )}
              <span>{simulating ? 'Menghitung...' : 'Hitung Simulasi Harga'}</span>
            </button>

            {simError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{simError}</span>
              </div>
            )}
          </form>

          {pricePreview && (
            <div className="px-5 pb-5 space-y-4">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-indigo-100">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">
                      {pricePreview.ratePlanNama}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatTanggalPendek(pricePreview.checkIn)} s/d{' '}
                      {formatTanggalPendek(pricePreview.checkOut)} ({pricePreview.jumlahMalam} malam)
                    </p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800">
                    Mode: {pricePreview.modeHarga}
                  </span>
                </div>

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal Kamar ({pricePreview.jumlahMalam} malam)</span>
                    <span className="font-medium text-slate-900">
                      {formatRupiah(pricePreview.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Service Charge ({pricePreview.serviceChargePct}%)</span>
                    <span className="font-medium text-slate-900">
                      {formatRupiah(pricePreview.serviceCharge)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Pajak Daerah ({pricePreview.pajakDaerahPct}%)</span>
                    <span className="font-medium text-slate-900">
                      {formatRupiah(pricePreview.pajak)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-indigo-200 text-base font-bold text-indigo-900">
                    <span>Total Tagihan Tamu</span>
                    <span>{formatRupiah(pricePreview.total)}</span>
                  </div>
                </div>
              </div>

              {/* Rincian per Malam */}
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Rincian Tarif per Malam (Rata-rata: {formatRupiah(pricePreview.tarifRataRata)})
                </p>
                <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Tanggal</th>
                        <th className="px-3 py-2 font-semibold">Musim</th>
                        <th className="px-3 py-2 font-semibold text-right">Tarif Malam</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pricePreview.rincianPerMalam.map((malam) => {
                        const meta = getKelasMusimMeta(malam.kelasMusim)
                        return (
                          <tr key={malam.tanggal}>
                            <td className="px-3 py-2 text-slate-800">
                              {formatTanggalPendek(malam.tanggal)}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${meta.badge}`}
                              >
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-slate-900">
                              {formatRupiah(malam.tarif)}
                              {malam.isOverride && (
                                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  Override
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Modal Edit Rate Plan */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Edit Rate Plan</h3>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tipe Kamar
                </label>
                <input
                  type="text"
                  disabled
                  value={editingPlan.roomType?.nama || '-'}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Rate Plan <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editNama}
                  onChange={(e) => setEditNama(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tarif Dasar (Rp) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  required
                  value={editTarifDasar}
                  onChange={(e) => setEditTarifDasar(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sumber</label>
                <select
                  value={editSumber}
                  onChange={(e) => setEditSumber(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {SUMBER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Inklusi (pisahkan dengan koma)
                </label>
                <input
                  type="text"
                  value={editInklusi}
                  onChange={(e) => setEditInklusi(e.target.value)}
                  placeholder="Sarapan, WiFi"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium cursor-pointer"
                >
                  {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
