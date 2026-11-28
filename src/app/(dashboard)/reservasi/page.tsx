'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRightLeft,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  List,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  UserPlus,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import {
  formatRupiah,
  formatTanggal,
  formatTanggalPendek,
  hitungJumlahMalam,
} from '@/lib/format'
import {
  MAX_GUEST_ADDRESS_LENGTH,
  formatGuestAddress,
  validateGuestAddress,
} from '@/lib/guest-validation'

interface RoomType {
  id: string
  nama: string
  kapasitas: number
}

interface Room {
  id: string
  nomor: string
  lantai: number | null
  roomTypeId: string
  roomType?: RoomType
  status: string
  aktif: boolean
}

interface Guest {
  id: string
  nama: string
  telepon: string | null
  email: string | null
  alamat: string | null
  flagVip: boolean
  flagBlacklist: boolean
}

interface RatePlan {
  id: string
  nama: string
  roomTypeId: string
  roomType?: RoomType
  tarifDasar: number
  sumber: string
  aktif: boolean
}

interface FolioSummary {
  id: string
  nomorFolio: string
  status: string
  totalCharge: number
  totalPayment: number
  balance: number
}

interface Reservation {
  id: string
  kodeBooking: string
  guestId: string
  guest: Guest
  roomId: string | null
  room: Room | null
  ratePlanId: string | null
  ratePlan: RatePlan | null
  tanggalCheckIn: string
  tanggalCheckOut: string
  jumlahMalam: number
  jumlahDewasa: number
  jumlahAnak: number
  tarifPerMalam: number
  totalTarif: number
  totalPajak: number
  totalServiceCharge: number
  totalKeseluruhan: number
  sumberBooking: string
  namaOta: string | null
  komisiOtaPct: number | null
  status: string
  alasanBatal: string | null
  diskonPct: number | null
  diskonNominal: number | null
  alasanDiskon: string | null
  extraBed: boolean
  biayaExtraBed: number | null
  earlyCheckIn: boolean
  lateCheckOut: boolean
  biayaTambahan: number
  catatan: string | null
  folio?: FolioSummary | null
}

type StatusTab = 'Semua' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED'
type ViewMode = 'list' | 'tape'

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'Semua', label: 'Semua' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'CHECKED_IN', label: 'Checked-In' },
  { key: 'CHECKED_OUT', label: 'Checked-Out' },
  { key: 'CANCELLED', label: 'Dibatalkan' },
]

const SUMBER_BOOKING_OPTIONS = [
  { value: 'WALK_IN', label: 'Walk-In' },
  { value: 'LANGSUNG', label: 'Langsung (Direct)' },
  { value: 'TELEPON_WA', label: 'Telepon / WhatsApp' },
  { value: 'OTA_TRAVELOKA', label: 'OTA - Traveloka' },
  { value: 'OTA_BOOKING', label: 'OTA - Booking.com' },
  { value: 'OTA_AGODA', label: 'OTA - Agoda' },
  { value: 'OTA_TIKET', label: 'OTA - Tiket.com' },
  { value: 'KORPORAT', label: 'Korporat' },
]

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toDateInputValue(d)
}

function normalizeDayKey(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  return d.toISOString().slice(0, 10)
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'CONFIRMED':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200'
    case 'TENTATIVE':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'CHECKED_IN':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'CHECKED_OUT':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'CANCELLED':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'NO_SHOW':
      return 'bg-orange-100 text-orange-800 border-orange-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'CONFIRMED':
      return 'Confirmed'
    case 'TENTATIVE':
      return 'Tentative'
    case 'CHECKED_IN':
      return 'Checked-In'
    case 'CHECKED_OUT':
      return 'Checked-Out'
    case 'CANCELLED':
      return 'Dibatalkan'
    case 'NO_SHOW':
      return 'No-Show'
    default:
      return status
  }
}

function getSumberLabel(sumber: string): string {
  const found = SUMBER_BOOKING_OPTIONS.find((s) => s.value === sumber)
  return found ? found.label : sumber
}

export default function ReservasiPage() {
  const todayStr = useMemo(() => toDateInputValue(new Date()), [])
  const tomorrowStr = useMemo(() => addDays(todayStr, 1), [todayStr])

  const [reservations, setReservations] = useState<Reservation[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const [activeTab, setActiveTab] = useState<StatusTab>('Semua')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [tapeStartDate, setTapeStartDate] = useState(todayStr)

  // Modal Buat Reservasi / Walk-in
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isWalkIn, setIsWalkIn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [guestId, setGuestId] = useState('')
  const [guestSearch, setGuestSearch] = useState('')
  const [guestAlamat, setGuestAlamat] = useState('')
  const [tanggalCheckIn, setTanggalCheckIn] = useState(todayStr)
  const [tanggalCheckOut, setTanggalCheckOut] = useState(tomorrowStr)
  const [roomId, setRoomId] = useState('')
  const [availableRooms, setAvailableRooms] = useState<Room[]>([])
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [ratePlanId, setRatePlanId] = useState('')
  const [tarifOverride, setTarifOverride] = useState('')
  const [sumberBooking, setSumberBooking] = useState('LANGSUNG')
  const [komisiOtaPct, setKomisiOtaPct] = useState('')
  const [diskonPct, setDiskonPct] = useState('')
  const [alasanDiskon, setAlasanDiskon] = useState('')
  const [extraBed, setExtraBed] = useState(false)
  const [biayaExtraBed, setBiayaExtraBed] = useState('100000')
  const [earlyCheckIn, setEarlyCheckIn] = useState(false)
  const [lateCheckOut, setLateCheckOut] = useState(false)
  const [jumlahDewasa, setJumlahDewasa] = useState('1')
  const [jumlahAnak, setJumlahAnak] = useState('0')
  const [catatan, setCatatan] = useState('')

  // Action Modals
  const [actionLoading, setActionLoading] = useState(false)
  const [checkInTarget, setCheckInTarget] = useState<Reservation | null>(null)
  const [checkInRoomId, setCheckInRoomId] = useState('')
  const [checkInGuestAlamat, setCheckInGuestAlamat] = useState('')
  const [checkInModalError, setCheckInModalError] = useState('')
  const [moveRoomTarget, setMoveRoomTarget] = useState<Reservation | null>(null)
  const [moveNewRoomId, setMoveNewRoomId] = useState('')
  const [extendTarget, setExtendTarget] = useState<Reservation | null>(null)
  const [extendNewCheckOut, setExtendNewCheckOut] = useState('')
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [selectedBlock, setSelectedBlock] = useState<Reservation | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }, [])

  const fetchAllData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [resReservasi, resKamar, resTamu, resTarif] = await Promise.all([
        fetch('/api/reservasi'),
        fetch('/api/kamar'),
        fetch('/api/tamu'),
        fetch('/api/tarif'),
      ])

      if (!resReservasi.ok) {
        const d = await resReservasi.json().catch(() => ({}))
        throw new Error(d.error || 'Gagal memuat data reservasi')
      }

      const [dataRes, dataKamar, dataTamu, dataTarif] = await Promise.all([
        resReservasi.json(),
        resKamar.ok ? resKamar.json() : Promise.resolve({ rooms: [] }),
        resTamu.ok ? resTamu.json() : Promise.resolve({ guests: [] }),
        resTarif.ok ? resTarif.json() : Promise.resolve({ ratePlans: [] }),
      ])

      setReservations(dataRes.reservations || [])
      setRooms(dataKamar.rooms || [])
      setGuests(dataTamu.guests || [])
      setRatePlans(dataTarif.ratePlans || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  // Check room availability when dates change inside modal
  useEffect(() => {
    if (!showCreateModal) return
    if (!tanggalCheckIn || !tanggalCheckOut || tanggalCheckOut <= tanggalCheckIn) {
      setAvailableRooms([])
      return
    }

    let cancelled = false
    async function checkAvail() {
      setCheckingAvailability(true)
      try {
        const res = await fetch(
          `/api/reservasi?checkAvailability=1&checkIn=${encodeURIComponent(
            tanggalCheckIn
          )}&checkOut=${encodeURIComponent(tanggalCheckOut)}`
        )
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          const avail: Room[] = data.rooms || []
          setAvailableRooms(avail)
          setRoomId((prev) => (prev && avail.some((r) => r.id === prev) ? prev : ''))
        }
      } catch {
        // ignore transient error
      } finally {
        if (!cancelled) setCheckingAvailability(false)
      }
    }
    checkAvail()
    return () => {
      cancelled = true
    }
  }, [showCreateModal, tanggalCheckIn, tanggalCheckOut])

  function openCreateModal(walkInMode: boolean, presetRoomId = '', presetDate = '') {
    const ci = presetDate || todayStr
    const co = addDays(ci, 1)
    setIsWalkIn(walkInMode)
    setFormError('')
    setGuestId('')
    setGuestSearch('')
    setGuestAlamat('')
    setTanggalCheckIn(ci)
    setTanggalCheckOut(co)
    setRoomId(presetRoomId)
    setRatePlanId('')
    setTarifOverride('')
    setSumberBooking(walkInMode ? 'WALK_IN' : 'LANGSUNG')
    setKomisiOtaPct('')
    setDiskonPct('')
    setAlasanDiskon('')
    setExtraBed(false)
    setBiayaExtraBed('100000')
    setEarlyCheckIn(false)
    setLateCheckOut(false)
    setJumlahDewasa('1')
    setJumlahAnak('0')
    setCatatan('')
    setShowCreateModal(true)
  }

  // Filter rate plans relevant to selected room's roomType
  const selectedRoomObj = useMemo(
    () => availableRooms.find((r) => r.id === roomId) || rooms.find((r) => r.id === roomId),
    [availableRooms, rooms, roomId]
  )

  const filteredRatePlans = useMemo(() => {
    const active = ratePlans.filter((rp) => rp.aktif)
    if (!selectedRoomObj) return active
    const matching = active.filter((rp) => rp.roomTypeId === selectedRoomObj.roomTypeId)
    return matching.length > 0 ? matching : active
  }, [ratePlans, selectedRoomObj])

  // Auto-select first matching rate plan when room changes and ratePlanId is incompatible
  useEffect(() => {
    if (!showCreateModal || !selectedRoomObj) return
    const matching = ratePlans.filter(
      (rp) => rp.aktif && rp.roomTypeId === selectedRoomObj.roomTypeId
    )
    if (matching.length > 0 && !matching.some((rp) => rp.id === ratePlanId)) {
      const preferred = matching.find((rp) => rp.sumber === 'UMUM') || matching[0]
      setRatePlanId(preferred.id)
    }
  }, [showCreateModal, selectedRoomObj, ratePlans, ratePlanId])

  const selectedRatePlan = useMemo(
    () => ratePlans.find((rp) => rp.id === ratePlanId),
    [ratePlans, ratePlanId]
  )

  const filteredGuests = useMemo(() => {
    const q = guestSearch.trim().toLowerCase()
    if (!q) return guests
    return guests.filter(
      (g) =>
        g.nama.toLowerCase().includes(q) ||
        (g.telepon && g.telepon.toLowerCase().includes(q)) ||
        (g.email && g.email.toLowerCase().includes(q))
    )
  }, [guests, guestSearch])

  const selectedGuest = useMemo(
    () => guests.find((g) => g.id === guestId),
    [guests, guestId]
  )

  const isOtaBooking = sumberBooking.startsWith('OTA_')

  const jumlahMalamPreview = useMemo(() => {
    if (!tanggalCheckIn || !tanggalCheckOut) return 0
    const ci = new Date(`${tanggalCheckIn}T00:00:00`)
    const co = new Date(`${tanggalCheckOut}T00:00:00`)
    const diff = hitungJumlahMalam(ci, co)
    return diff > 0 ? diff : 0
  }, [tanggalCheckIn, tanggalCheckOut])

  const estimasiSubtotal = useMemo(() => {
    const rate =
      tarifOverride.trim() !== ''
        ? Number(tarifOverride) || 0
        : selectedRatePlan?.tarifDasar || 0
    const kamarTotal = rate * jumlahMalamPreview
    const eb = extraBed ? Number(biayaExtraBed) || 0 : 0
    const raw = kamarTotal + eb
    const disc = diskonPct ? Math.round(raw * (Number(diskonPct) / 100)) : 0
    return Math.max(0, raw - disc)
  }, [tarifOverride, selectedRatePlan, jumlahMalamPreview, extraBed, biayaExtraBed, diskonPct])

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    if (!guestId) {
      setFormError('Silakan pilih tamu terlebih dahulu.')
      return
    }
    const addressCheck = validateGuestAddress(guestAlamat, { required: isWalkIn })
    if (!addressCheck.valid) {
      setFormError(addressCheck.error)
      return
    }
    if (jumlahMalamPreview <= 0) {
      setFormError('Tanggal check-out harus setelah tanggal check-in.')
      return
    }
    if (isWalkIn && !roomId) {
      setFormError('Kamar wajib dipilih untuk proses Walk-in Cepat.')
      return
    }
    if (!ratePlanId && !tarifOverride) {
      setFormError('Pilih Rate Plan atau isi tarif per malam.')
      return
    }
    if (Number(diskonPct) > 0 && !alasanDiskon.trim()) {
      setFormError('Alasan diskon wajib diisi jika memberikan diskon.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        walkIn: isWalkIn,
        guestId,
        guestAlamat: addressCheck.value ?? undefined,
        roomId: roomId || undefined,
        ratePlanId: ratePlanId || undefined,
        tarifPerMalam: tarifOverride.trim() !== '' ? Number(tarifOverride) : undefined,
        tanggalCheckIn,
        tanggalCheckOut,
        jumlahDewasa: Number(jumlahDewasa) || 1,
        jumlahAnak: Number(jumlahAnak) || 0,
        sumberBooking,
        komisiOtaPct: isOtaBooking && komisiOtaPct ? Number(komisiOtaPct) : undefined,
        diskonPct: diskonPct ? Number(diskonPct) : undefined,
        alasanDiskon: diskonPct && Number(diskonPct) > 0 ? alasanDiskon.trim() : undefined,
        extraBed,
        biayaExtraBed: extraBed ? Number(biayaExtraBed) || 0 : undefined,
        earlyCheckIn,
        lateCheckOut,
        catatan: catatan.trim() || undefined,
      }

      const res = await fetch('/api/reservasi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Gagal menyimpan reservasi')
        return
      }

      setShowCreateModal(false)
      showToast(
        isWalkIn
          ? `Walk-in berhasil! Tamu check-in dengan kode ${data.reservation?.kodeBooking || ''}`
          : `Reservasi ${data.reservation?.kodeBooking || ''} berhasil dibuat`
      )
      await fetchAllData()
    } catch {
      setFormError('Gagal menghubungi server')
    } finally {
      setSubmitting(false)
    }
  }

  async function performReservationAction(
    id: string,
    payload: Record<string, unknown>,
    successMsg: string
  ) {
    setActionLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/reservasi/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Gagal memproses aksi reservasi')
        return false
      }
      showToast(successMsg)
      await fetchAllData()
      return true
    } catch {
      setError('Gagal terhubung ke server')
      return false
    } finally {
      setActionLoading(false)
    }
  }

  // Tab counts & filtered list
  const tabCounts = useMemo(() => {
    const counts: Record<StatusTab, number> = {
      Semua: reservations.length,
      CONFIRMED: 0,
      CHECKED_IN: 0,
      CHECKED_OUT: 0,
      CANCELLED: 0,
    }
    for (const r of reservations) {
      if (r.status in counts) {
        counts[r.status as Exclude<StatusTab, 'Semua'>] += 1
      }
    }
    return counts
  }, [reservations])

  const filteredReservations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return reservations.filter((r) => {
      if (activeTab !== 'Semua' && r.status !== activeTab) return false
      if (!q) return true
      return (
        r.kodeBooking.toLowerCase().includes(q) ||
        r.guest?.nama?.toLowerCase().includes(q) ||
        (r.room?.nomor && r.room.nomor.toLowerCase().includes(q)) ||
        r.sumberBooking.toLowerCase().includes(q)
      )
    })
  }, [reservations, activeTab, searchQuery])

  // Tape chart 7-day columns
  const tapeDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const dateStr = addDays(tapeStartDate, i)
      const d = new Date(`${dateStr}T00:00:00`)
      return {
        dateStr,
        labelHari: new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(d),
        labelTgl: new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(d),
      }
    })
  }, [tapeStartDate])

  const activeRoomsList = useMemo(
    () => rooms.filter((r) => r.aktif).sort((a, b) => a.nomor.localeCompare(b.nomor)),
    [rooms]
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reservasi &amp; Front Desk</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Kelola pemesanan kamar, walk-in cepat, check-in/out, dan kalender kamar
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchAllData()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>
          <button
            type="button"
            onClick={() => openCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition cursor-pointer"
          >
            <Zap className="w-4 h-4" />
            <span>Walk-in Cepat</span>
          </button>
          <button
            type="button"
            onClick={() => openCreateModal(false)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Reservasi Baru</span>
          </button>
        </div>
      </div>

      {/* Alerts / Toast */}
      {toast && (
        <div className="flex items-center justify-between gap-2 p-3.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{toast}</span>
          </div>
          <button type="button" onClick={() => setToast('')} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs, Search, View Toggle */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((tab) => {
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    active
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[11px] ${
                      active ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600'
                    }`}
                  >
                    {tabCounts[tab.key]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Search & View Toggle */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kode, tamu, kamar..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Daftar Reservasi</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tape')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  viewMode === 'tape'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Tape Chart (Kalender Kamar)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          Memuat data reservasi...
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          {filteredReservations.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-medium text-slate-700">Belum ada reservasi yang cocok</p>
              <p className="text-xs text-slate-500">
                Ubah filter atau buat reservasi baru / walk-in cepat.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Kode &amp; Sumber</th>
                    <th className="px-4 py-3">Tamu</th>
                    <th className="px-4 py-3">Kamar</th>
                    <th className="px-4 py-3">Jadwal Menginap</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredReservations.map((res) => (
                    <tr key={res.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3.5 align-top">
                        <div className="font-mono font-semibold text-slate-900 text-xs">
                          {res.kodeBooking}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {getSumberLabel(res.sumberBooking)}
                          {res.komisiOtaPct ? ` (${res.komisiOtaPct}%)` : ''}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {res.extraBed && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-50 text-purple-700 border border-purple-200">
                              Extra Bed
                            </span>
                          )}
                          {res.earlyCheckIn && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-sky-50 text-sky-700 border border-sky-200">
                              Early CI
                            </span>
                          )}
                          {res.lateCheckOut && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-50 text-amber-700 border border-amber-200">
                              Late CO
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <div className="flex items-center gap-1.5 font-medium text-slate-900">
                          <span>{res.guest?.nama || '-'}</span>
                          {res.guest?.flagVip && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                              <Sparkles className="w-2.5 h-2.5" />
                              VIP
                            </span>
                          )}
                        </div>
                        {res.guest?.telepon && (
                          <div className="text-xs text-slate-500 mt-0.5">{res.guest.telepon}</div>
                        )}
                        <div
                          className="text-xs text-slate-500 mt-0.5 max-w-[220px] truncate"
                          title={res.guest?.alamat || undefined}
                        >
                          Alamat: {formatGuestAddress(res.guest?.alamat)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        {res.room ? (
                          <div>
                            <span className="font-semibold text-slate-900">
                              Kamar {res.room.nomor}
                            </span>
                            <div className="text-xs text-slate-500">
                              {res.room.roomType?.nama || '-'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs italic text-amber-600">Belum dipilih</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <div className="text-xs text-slate-800 font-medium">
                          {formatTanggalPendek(res.tanggalCheckIn)} &rarr;{' '}
                          {formatTanggalPendek(res.tanggalCheckOut)}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {res.jumlahMalam} malam &middot; {res.jumlahDewasa} dws
                          {res.jumlahAnak > 0 ? `, ${res.jumlahAnak} ank` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top text-right">
                        <div className="font-semibold text-slate-900">
                          {formatRupiah(res.totalKeseluruhan)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatRupiah(res.tarifPerMalam)}/mlm
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadge(
                            res.status
                          )}`}
                        >
                          {getStatusLabel(res.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 align-top text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {(res.status === 'CONFIRMED' || res.status === 'TENTATIVE') && (
                            <>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => {
                                  setCheckInTarget(res)
                                  setCheckInRoomId(res.roomId || '')
                                  setCheckInGuestAlamat(res.guest?.alamat ?? '')
                                  setCheckInModalError('')
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer"
                              >
                                <LogIn className="w-3.5 h-3.5" />
                                <span>Check-in</span>
                              </button>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => {
                                  setCancelTarget(res)
                                  setCancelReason('')
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Batal</span>
                              </button>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Tandai reservasi ${res.kodeBooking} sebagai No-Show?`
                                    )
                                  ) {
                                    performReservationAction(
                                      res.id,
                                      { action: 'NO_SHOW' },
                                      `Reservasi ${res.kodeBooking} ditandai No-Show`
                                    )
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 transition cursor-pointer"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>No-Show</span>
                              </button>
                            </>
                          )}

                          {res.status === 'CHECKED_IN' && (
                            <>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => {
                                  const balanceInfo =
                                    res.folio && res.folio.balance > 0
                                      ? `\n\nPerhatian: Sisa tagihan folio masih ${formatRupiah(
                                          res.folio.balance
                                        )}.`
                                      : ''
                                  if (
                                    window.confirm(
                                      `Proses Check-out untuk ${res.guest?.nama} (Kamar ${
                                        res.room?.nomor || '-'
                                      })?${balanceInfo}`
                                    )
                                  ) {
                                    performReservationAction(
                                      res.id,
                                      { action: 'CHECK_OUT' },
                                      `Check-out berhasil untuk ${res.kodeBooking}`
                                    )
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-900 text-white transition cursor-pointer"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>Check-out</span>
                              </button>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => {
                                  setMoveRoomTarget(res)
                                  setMoveNewRoomId('')
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition cursor-pointer"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                <span>Pindah Kamar</span>
                              </button>
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => {
                                  setExtendTarget(res)
                                  setExtendNewCheckOut(
                                    addDays(normalizeDayKey(res.tanggalCheckOut), 1)
                                  )
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition cursor-pointer"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                <span>Perpanjang</span>
                              </button>
                              <Link
                                href={res.folio?.id ? `/folio?id=${res.folio.id}` : '/folio'}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Buka Folio</span>
                              </Link>
                            </>
                          )}

                          {res.status !== 'CHECKED_IN' && res.folio?.id && (
                            <Link
                              href={`/folio?id=${res.folio.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Folio</span>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Tape Chart View */
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTapeStartDate((prev) => addDays(prev, -7))}
                className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 cursor-pointer"
                aria-label="7 hari sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setTapeStartDate(todayStr)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 hover:bg-slate-50 cursor-pointer"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => setTapeStartDate((prev) => addDays(prev, 7))}
                className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 cursor-pointer"
                aria-label="7 hari berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-slate-800 ml-2">
                {formatTanggalPendek(tapeDays[0].dateStr)} &ndash;{' '}
                {formatTanggalPendek(tapeDays[6].dateStr)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-indigo-500 inline-block" /> Confirmed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Checked-In
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-400 inline-block" /> Checked-Out
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Tentative
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 w-44 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                    Kamar
                  </th>
                  {tapeDays.map((day) => (
                    <th
                      key={day.dateStr}
                      className={`px-2 py-2.5 text-center font-semibold border-r border-slate-200 last:border-r-0 ${
                        day.dateStr === todayStr
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-600'
                      }`}
                    >
                      <div>{day.labelHari}</div>
                      <div className="text-[11px] font-normal">{day.labelTgl}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {activeRoomsList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      Belum ada kamar aktif.
                    </td>
                  </tr>
                ) : (
                  activeRoomsList.map((room) => {
                    const roomReservations = reservations.filter(
                      (r) =>
                        r.roomId === room.id &&
                        ['CONFIRMED', 'TENTATIVE', 'CHECKED_IN', 'CHECKED_OUT'].includes(
                          r.status
                        )
                    )

                    return (
                      <tr key={room.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 sticky left-0 bg-white z-10 border-r border-slate-200">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="font-semibold text-slate-900">
                                Kamar {room.nomor}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {room.roomType?.nama || '-'}
                              </div>
                            </div>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                room.status === 'TERISI'
                                  ? 'bg-emerald-500'
                                  : room.status === 'OUT_OF_ORDER' ||
                                      room.status === 'MAINTENANCE'
                                    ? 'bg-red-500'
                                    : 'bg-slate-300'
                              }`}
                              title={room.status}
                            />
                          </div>
                        </td>

                        {tapeDays.map((day) => {
                          const booking = roomReservations.find((r) => {
                            const ci = normalizeDayKey(r.tanggalCheckIn)
                            const co = normalizeDayKey(r.tanggalCheckOut)
                            return ci <= day.dateStr && day.dateStr < co
                          })

                          if (!booking) {
                            return (
                              <td
                                key={day.dateStr}
                                className="p-1.5 border-r border-slate-100 last:border-r-0 text-center"
                              >
                                <button
                                  type="button"
                                  onClick={() => openCreateModal(false, room.id, day.dateStr)}
                                  title={`Buat reservasi Kamar ${room.nomor} (${day.labelTgl})`}
                                  className="w-full h-10 rounded-md border border-dashed border-transparent hover:border-indigo-300 hover:bg-indigo-50/60 text-slate-300 hover:text-indigo-600 transition flex items-center justify-center cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )
                          }

                          const blockColor =
                            booking.status === 'CHECKED_IN'
                              ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                              : booking.status === 'CONFIRMED'
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                : booking.status === 'TENTATIVE'
                                  ? 'bg-amber-400 hover:bg-amber-500 text-slate-900'
                                  : 'bg-slate-400 hover:bg-slate-500 text-white'

                          return (
                            <td
                              key={day.dateStr}
                              className="p-1.5 border-r border-slate-100 last:border-r-0"
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedBlock(booking)}
                                className={`w-full h-10 px-2 rounded-md text-left shadow-xs transition truncate cursor-pointer ${blockColor}`}
                                title={`${booking.guest?.nama} (${booking.kodeBooking})`}
                              >
                                <div className="font-semibold truncate text-[11px] leading-tight">
                                  {booking.guest?.nama || 'Tamu'}
                                </div>
                                <div className="text-[10px] opacity-90 truncate">
                                  {booking.kodeBooking}
                                </div>
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Buat Reservasi / Walk-in */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                {isWalkIn ? (
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                    <Zap className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
                    <CalendarCheck className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {isWalkIn ? 'Walk-in Cepat (Langsung Check-in)' : 'Buat Reservasi Baru'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isWalkIn
                      ? 'Tamu langsung masuk kamar dan biaya malam pertama dicatat ke folio'
                      : 'Cek ketersediaan kamar otomatis sesuai tanggal menginap'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {formError && (
                <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Tamu Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-800">
                    Data Tamu <span className="text-red-500">*</span>
                  </label>
                  <Link
                    href="/tamu"
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Kelola / Tambah Tamu Baru</span>
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    placeholder="Filter nama / telepon tamu..."
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <select
                    required
                    value={guestId}
                    onChange={(e) => {
                      const nextId = e.target.value
                      setGuestId(nextId)
                      const found = guests.find((g) => g.id === nextId)
                      setGuestAlamat(found?.alamat ?? '')
                    }}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">-- Pilih Tamu ({filteredGuests.length}) --</option>
                    {filteredGuests.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nama} {g.telepon ? `(${g.telepon})` : ''}{' '}
                        {g.flagVip ? '[VIP]' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {guestId && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Alamat Tamu {isWalkIn && <span className="text-red-500">*</span>}
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {guestAlamat.length}/{MAX_GUEST_ADDRESS_LENGTH}
                      </span>
                    </div>
                    <input
                      type="text"
                      required={isWalkIn}
                      maxLength={MAX_GUEST_ADDRESS_LENGTH}
                      value={guestAlamat}
                      onChange={(e) =>
                        setGuestAlamat(e.target.value.replace(/[\r\n]+/g, ' '))
                      }
                      placeholder="Alamat lengkap tamu (satu baris, maks. 200 karakter)"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}

                {selectedGuest?.flagBlacklist && (
                  <div className="p-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                    Peringatan: Tamu ini memiliki status <strong>BLACKLIST</strong>.
                  </div>
                )}
              </div>

              {/* Tanggal Check-In & Check-Out */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Check-In <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggalCheckIn}
                    onChange={(e) => setTanggalCheckIn(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Check-Out <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggalCheckOut}
                    onChange={(e) => setTanggalCheckOut(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="px-3 py-2 bg-slate-100 rounded-lg text-sm font-semibold text-slate-800 text-center">
                    {jumlahMalamPreview} Malam
                  </div>
                </div>
              </div>

              {/* Pilih Kamar & Rate Plan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pilih Kamar {isWalkIn && <span className="text-red-500">*</span>}
                    {checkingAvailability && (
                      <span className="ml-1.5 text-indigo-600 font-normal">
                        (Mengecek...)
                      </span>
                    )}
                  </label>
                  <select
                    required={isWalkIn}
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">
                      {isWalkIn ? '-- Pilih Kamar Tersedia --' : '-- Pilih Kamar (Opsional) --'}
                    </option>
                    {availableRooms.map((rm) => (
                      <option key={rm.id} value={rm.id}>
                        Kamar {rm.nomor} &ndash; {rm.roomType?.nama || 'Standar'}
                        {rm.lantai ? ` (Lt. ${rm.lantai})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {availableRooms.length} kamar tersedia pada rentang tanggal ini.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rate Plan <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={ratePlanId}
                    onChange={(e) => setRatePlanId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">-- Pilih Rate Plan --</option>
                    {filteredRatePlans.map((rp) => (
                      <option key={rp.id} value={rp.id}>
                        {rp.nama} ({rp.roomType?.nama}) &ndash; {formatRupiah(rp.tarifDasar)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sumber Booking, Komisi OTA, Tarif Override */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sumber Booking
                  </label>
                  <select
                    value={sumberBooking}
                    onChange={(e) => setSumberBooking(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {SUMBER_BOOKING_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {isOtaBooking && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Komisi OTA (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={komisiOtaPct}
                      onChange={(e) => setKomisiOtaPct(e.target.value)}
                      placeholder="Contoh: 15"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Override Tarif/Malam (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={tarifOverride}
                    onChange={(e) => setTarifOverride(e.target.value)}
                    placeholder={
                      selectedRatePlan
                        ? `Default ${selectedRatePlan.tarifDasar}`
                        : 'Opsional'
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Diskon */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Diskon (%) (Opsional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={diskonPct}
                    onChange={(e) => setDiskonPct(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alasan Diskon {Number(diskonPct) > 0 && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    required={Number(diskonPct) > 0}
                    value={alasanDiskon}
                    onChange={(e) => setAlasanDiskon(e.target.value)}
                    placeholder="Contoh: Promo Member / Corporate Rate"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Tamu Dewasa / Anak & Tambahan */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-center">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dewasa</label>
                  <input
                    type="number"
                    min="1"
                    value={jumlahDewasa}
                    onChange={(e) => setJumlahDewasa(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Anak</label>
                  <input
                    type="number"
                    min="0"
                    value={jumlahAnak}
                    onChange={(e) => setJumlahAnak(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="col-span-2 flex flex-wrap gap-4 pt-4">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={extraBed}
                      onChange={(e) => setExtraBed(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Extra Bed</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={earlyCheckIn}
                      onChange={(e) => setEarlyCheckIn(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Early Check-In</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lateCheckOut}
                      onChange={(e) => setLateCheckOut(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Late Check-Out</span>
                  </label>
                </div>
              </div>

              {extraBed && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Biaya Extra Bed (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={biayaExtraBed}
                    onChange={(e) => setBiayaExtraBed(e.target.value)}
                    className="w-full sm:w-64 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Reservasi
                </label>
                <textarea
                  rows={2}
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Permintaan khusus tamu..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Estimasi Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs text-slate-600">
                  Estimasi Subtotal Sebelum Pajak &amp; Service Charge ({jumlahMalamPreview} malam)
                </div>
                <div className="text-lg font-bold text-indigo-700">
                  {formatRupiah(estimasiSubtotal)}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-5 py-2 text-sm font-medium text-white rounded-lg shadow-xs transition cursor-pointer ${
                    isWalkIn
                      ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400'
                      : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400'
                  }`}
                >
                  {submitting
                    ? 'Menyimpan...'
                    : isWalkIn
                      ? 'Simpan & Check-in Sekarang'
                      : 'Simpan Reservasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Check-In */}
      {checkInTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Proses Check-In</h3>
            <p className="text-sm text-slate-600">
              Tamu: <strong>{checkInTarget.guest?.nama}</strong> ({checkInTarget.kodeBooking})
            </p>
            {checkInModalError && (
              <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{checkInModalError}</span>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Alamat Tamu <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  {checkInGuestAlamat.length}/{MAX_GUEST_ADDRESS_LENGTH}
                </span>
              </div>
              <input
                type="text"
                required
                maxLength={MAX_GUEST_ADDRESS_LENGTH}
                value={checkInGuestAlamat}
                onChange={(e) => {
                  setCheckInGuestAlamat(e.target.value.replace(/[\r\n]+/g, ' '))
                  if (checkInModalError) setCheckInModalError('')
                }}
                placeholder="Wajib diisi saat check-in (maks. 200 karakter)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pilih / Konfirmasi Kamar <span className="text-red-500">*</span>
              </label>
              <select
                value={checkInRoomId}
                onChange={(e) => setCheckInRoomId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- Pilih Kamar --</option>
                {rooms
                  .filter(
                    (r) =>
                      r.aktif &&
                      (r.status === 'TERSEDIA' || r.id === checkInTarget.roomId) &&
                      r.status !== 'OUT_OF_ORDER'
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      Kamar {r.nomor} &ndash; {r.roomType?.nama || ''} ({r.status})
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCheckInTarget(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!checkInRoomId || actionLoading}
                onClick={async () => {
                  const addressCheck = validateGuestAddress(checkInGuestAlamat, {
                    required: true,
                  })
                  if (!addressCheck.valid) {
                    setCheckInModalError(addressCheck.error)
                    return
                  }
                  const ok = await performReservationAction(
                    checkInTarget.id,
                    {
                      action: 'CHECK_IN',
                      roomId: checkInRoomId,
                      guestAlamat: addressCheck.value,
                    },
                    `Check-in berhasil untuk ${checkInTarget.kodeBooking}`
                  )
                  if (ok) setCheckInTarget(null)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-lg cursor-pointer"
              >
                {actionLoading ? 'Memproses...' : 'Konfirmasi Check-In'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pindah Kamar */}
      {moveRoomTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Pindah Kamar</h3>
            <p className="text-sm text-slate-600">
              Tamu: <strong>{moveRoomTarget.guest?.nama}</strong> &middot; Kamar saat ini:{' '}
              <strong>{moveRoomTarget.room?.nomor || '-'}</strong>
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kamar Tujuan <span className="text-red-500">*</span>
              </label>
              <select
                value={moveNewRoomId}
                onChange={(e) => setMoveNewRoomId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">-- Pilih Kamar Tujuan --</option>
                {rooms
                  .filter(
                    (r) =>
                      r.aktif &&
                      r.id !== moveRoomTarget.roomId &&
                      r.status === 'TERSEDIA'
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      Kamar {r.nomor} &ndash; {r.roomType?.nama || ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMoveRoomTarget(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!moveNewRoomId || actionLoading}
                onClick={async () => {
                  const ok = await performReservationAction(
                    moveRoomTarget.id,
                    { action: 'MOVE_ROOM', newRoomId: moveNewRoomId },
                    `Pindah kamar berhasil untuk ${moveRoomTarget.kodeBooking}`
                  )
                  if (ok) setMoveRoomTarget(null)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg cursor-pointer"
              >
                {actionLoading ? 'Memproses...' : 'Pindahkan Kamar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Perpanjang Menginap */}
      {extendTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Perpanjang Masa Menginap</h3>
            <p className="text-sm text-slate-600">
              Tamu: <strong>{extendTarget.guest?.nama}</strong> &middot; Check-out saat ini:{' '}
              <strong>{formatTanggal(extendTarget.tanggalCheckOut)}</strong>
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tanggal Check-Out Baru <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={extendNewCheckOut}
                onChange={(e) => setExtendNewCheckOut(e.target.value)}
                min={addDays(normalizeDayKey(extendTarget.tanggalCheckIn), 1)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExtendTarget(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!extendNewCheckOut || actionLoading}
                onClick={async () => {
                  const ok = await performReservationAction(
                    extendTarget.id,
                    { action: 'EXTEND', tanggalCheckOut: extendNewCheckOut },
                    `Masa menginap ${extendTarget.kodeBooking} berhasil diperpanjang`
                  )
                  if (ok) setExtendTarget(null)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg cursor-pointer"
              >
                {actionLoading ? 'Memproses...' : 'Simpan Perpanjangan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Batalkan Reservasi */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Batalkan Reservasi</h3>
            <p className="text-sm text-slate-600">
              Anda yakin ingin membatalkan reservasi{' '}
              <strong>{cancelTarget.kodeBooking}</strong> atas nama{' '}
              <strong>{cancelTarget.guest?.nama}</strong>?
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alasan Pembatalan
              </label>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Contoh: Tamu membatalkan via telepon"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={async () => {
                  const ok = await performReservationAction(
                    cancelTarget.id,
                    { action: 'CANCEL', alasanBatal: cancelReason.trim() || undefined },
                    `Reservasi ${cancelTarget.kodeBooking} dibatalkan`
                  )
                  if (ok) setCancelTarget(null)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg cursor-pointer"
              >
                {actionLoading ? 'Memproses...' : 'Ya, Batalkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detail Booking Block from Tape Chart */}
      {selectedBlock && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(
                    selectedBlock.status
                  )}`}
                >
                  {getStatusLabel(selectedBlock.status)}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {selectedBlock.guest?.nama}
                </h3>
                <p className="text-xs font-mono text-slate-500">{selectedBlock.kodeBooking}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBlock(null)}
                className="p-1 rounded hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 text-sm space-y-1.5">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 shrink-0">Alamat</span>
                <span className="text-right">{formatGuestAddress(selectedBlock.guest?.alamat)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Kamar</span>
                <span className="font-semibold">
                  Kamar {selectedBlock.room?.nomor || '-'} ({selectedBlock.room?.roomType?.nama})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Check-In</span>
                <span>{formatTanggalPendek(selectedBlock.tanggalCheckIn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Check-Out</span>
                <span>{formatTanggalPendek(selectedBlock.tanggalCheckOut)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Tagihan</span>
                <span className="font-semibold text-indigo-700">
                  {formatRupiah(selectedBlock.totalKeseluruhan)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {selectedBlock.folio?.id && (
                <Link
                  href={`/folio?id=${selectedBlock.folio.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg border border-indigo-200"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Folio</span>
                </Link>
              )}
              {(selectedBlock.status === 'CONFIRMED' || selectedBlock.status === 'TENTATIVE') && (
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedBlock
                    setSelectedBlock(null)
                    setCheckInTarget(target)
                    setCheckInRoomId(target.roomId || '')
                    setCheckInGuestAlamat(target.guest?.alamat ?? '')
                    setCheckInModalError('')
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Check-In</span>
                </button>
              )}
              {selectedBlock.status === 'CHECKED_IN' && (
                <button
                  type="button"
                  onClick={async () => {
                    const target = selectedBlock
                    if (
                      window.confirm(
                        `Proses Check-out untuk ${target.guest?.nama} (Kamar ${
                          target.room?.nomor || '-'
                        })?`
                      )
                    ) {
                      const ok = await performReservationAction(
                        target.id,
                        { action: 'CHECK_OUT' },
                        `Check-out berhasil untuk ${target.kodeBooking}`
                      )
                      if (ok) setSelectedBlock(null)
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 text-white hover:bg-slate-900 rounded-lg cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Check-Out</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
