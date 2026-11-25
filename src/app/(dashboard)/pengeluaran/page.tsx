'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCircle2,
  Coins,
  FolderTree,
  Plus,
  Receipt,
  RefreshCw,
  Wallet,
  X,
} from 'lucide-react'
import { formatRupiah, formatTanggalPendek } from '@/lib/format'

type TabKey = 'harian' | 'berulang' | 'kas-kecil' | 'kategori'

interface UserSummary {
  id: string
  nama: string
  username: string
  role: 'OWNER' | 'MANAJER' | 'RESEPSIONIS' | 'ADMIN_KEUANGAN'
}

interface ExpenseCategory {
  id: string
  nama: string
  departemen: 'KAMAR' | 'FNB' | 'TAK_TERDISTRIBUSI' | 'TETAP'
  kodeUsali: string | null
  aktif: boolean
}

interface Expense {
  id: string
  tanggal: string
  categoryId: string
  category: ExpenseCategory
  departemen: string
  nominal: number
  metodeBayar: 'TUNAI' | 'TRANSFER' | 'KAS_KECIL'
  vendor: string | null
  catatan: string | null
  jenisBeban: 'OPERASIONAL' | 'INVESTASI'
  statusApproval: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdBy?: UserSummary | null
  approvedBy?: UserSummary | null
}

interface RecurringExpense {
  id: string
  nama: string
  categoryId: string
  category: ExpenseCategory
  nominal: number
  periodeAwal: string
  periodeAkhir: string
  alokasiHarian: number
  aktif: boolean
}

interface PettyCashEntry {
  id: string
  tanggal: string
  jenis: 'SALDO_AWAL' | 'TOP_UP' | 'PENGELUARAN' | 'REKONSILIASI'
  nominal: number
  saldo: number
  keterangan: string | null
}

const DEPARTEMEN_LABEL: Record<string, string> = {
  KAMAR: 'Departemen Kamar',
  FNB: 'Departemen F&B',
  TAK_TERDISTRIBUSI: 'Tak Terdistribusi',
  TETAP: 'Biaya Tetap',
}

const METODE_BAYAR_LABEL: Record<string, string> = {
  TUNAI: 'Tunai',
  TRANSFER: 'Transfer Bank',
  KAS_KECIL: 'Kas Kecil',
}

const PETTY_CASH_JENIS_LABEL: Record<string, string> = {
  SALDO_AWAL: 'Saldo Awal',
  TOP_UP: 'Top Up',
  PENGELUARAN: 'Pengeluaran',
  REKONSILIASI: 'Rekonsiliasi',
}

function getTodayWIBClient(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

function getMonthStartWIBClient(): string {
  return `${getTodayWIBClient().slice(0, 7)}-01`
}

function hitungPreviewAlokasi(nominalStr: string, awal: string, akhir: string): number {
  const nominal = Number(nominalStr)
  if (!Number.isFinite(nominal) || nominal <= 0 || !awal || !akhir || akhir < awal) return 0
  const start = new Date(`${awal}T00:00:00.000Z`).getTime()
  const end = new Date(`${akhir}T00:00:00.000Z`).getTime()
  const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1)
  return Math.round(nominal / days)
}

export default function PengeluaranPage() {
  const today = useMemo(() => getTodayWIBClient(), [])
  const [activeTab, setActiveTab] = useState<TabKey>('harian')
  const [currentUser, setCurrentUser] = useState<UserSummary | null>(null)

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([])
  const [pettyCash, setPettyCash] = useState<PettyCashEntry[]>([])
  const [pettyCashSaldo, setPettyCashSaldo] = useState(0)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Filter state
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterDept, setFilterDept] = useState('ALL')

  // Form: Pengeluaran Harian
  const [expTanggal, setExpTanggal] = useState(today)
  const [expCategoryId, setExpCategoryId] = useState('')
  const [expNominal, setExpNominal] = useState('')
  const [expMetodeBayar, setExpMetodeBayar] = useState<'TUNAI' | 'TRANSFER' | 'KAS_KECIL'>('TUNAI')
  const [expVendor, setExpVendor] = useState('')
  const [expCatatan, setExpCatatan] = useState('')
  const [expJenisBeban, setExpJenisBeban] = useState<'OPERASIONAL' | 'INVESTASI'>('OPERASIONAL')

  // Form: Biaya Berulang
  const [recNama, setRecNama] = useState('')
  const [recCategoryId, setRecCategoryId] = useState('')
  const [recNominal, setRecNominal] = useState('')
  const [recPeriodeAwal, setRecPeriodeAwal] = useState(getMonthStartWIBClient)
  const [recPeriodeAkhir, setRecPeriodeAkhir] = useState(today)

  // Form: Kas Kecil
  const [pcTanggal, setPcTanggal] = useState(today)
  const [pcJenis, setPcJenis] = useState<'SALDO_AWAL' | 'TOP_UP' | 'PENGELUARAN' | 'REKONSILIASI'>('TOP_UP')
  const [pcNominal, setPcNominal] = useState('')
  const [pcKeterangan, setPcKeterangan] = useState('')

  // Form: Kategori USALI
  const [catNama, setCatNama] = useState('')
  const [catDepartemen, setCatDepartemen] = useState<'KAMAR' | 'FNB' | 'TAK_TERDISTRIBUSI' | 'TETAP'>('TAK_TERDISTRIBUSI')
  const [catKodeUsali, setCatKodeUsali] = useState('')

  const canWrite =
    !currentUser ||
    ['OWNER', 'MANAJER', 'ADMIN_KEUANGAN'].includes(currentUser.role)
  const canApprove =
    currentUser?.role === 'OWNER' || currentUser?.role === 'MANAJER'

  const fetchPengeluaran = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)
      if (filterDept && filterDept !== 'ALL') params.set('departemen', filterDept)
      const qs = params.toString()

      const res = await fetch(`/api/pengeluaran${qs ? `?${qs}` : ''}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Gagal memuat data pengeluaran.')
        return
      }

      const cats: ExpenseCategory[] = data.categories || []
      setExpenses(data.expenses || [])
      setCategories(cats)
      setRecurringExpenses(data.recurringExpenses || [])
      setPettyCash(data.pettyCash || [])
      setPettyCashSaldo(data.pettyCashSaldo ?? 0)

      if (cats.length > 0) {
        setExpCategoryId((prev) => prev || cats[0].id)
        setRecCategoryId((prev) => prev || cats[0].id)
      }
    } catch {
      setError('Gagal terhubung ke server.')
    } finally {
      setLoading(false)
    }
  }, [filterFrom, filterTo, filterDept])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUser(data.user)
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    fetchPengeluaran()
  }, [fetchPengeluaran])

  function notifySuccess(msg: string) {
    setSuccess(msg)
    setError('')
    setTimeout(() => {
      setSuccess((curr) => (curr === msg ? '' : curr))
    }, 4000)
  }

  async function handleSubmitExpense(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/pengeluaran', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tanggal: expTanggal,
          categoryId: expCategoryId,
          nominal: Number(expNominal),
          metodeBayar: expMetodeBayar,
          vendor: expVendor,
          catatan: expCatatan,
          jenisBeban: expJenisBeban,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Gagal menyimpan pengeluaran.')
        return
      }
      setExpNominal('')
      setExpVendor('')
      setExpCatatan('')
      const statusLabel =
        data.expense?.statusApproval === 'PENDING'
          ? 'Menunggu persetujuan Manajer/Owner (nominal >= Rp 1.000.000).'
          : 'Pengeluaran berhasil dicatat.'
      notifySuccess(statusLabel)
      await fetchPengeluaran()
    } catch {
      setError('Gagal terhubung ke server.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApproval(id: string, statusApproval: 'APPROVED' | 'REJECTED') {
    setError('')
    setSuccess('')
    setProcessingId(id)
    try {
      const res = await fetch(`/api/pengeluaran/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusApproval }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Gagal memproses persetujuan.')
        return
      }
      notifySuccess(
        statusApproval === 'APPROVED'
          ? 'Pengeluaran berhasil disetujui.'
          : 'Pengeluaran ditolak.'
      )
      await fetchPengeluaran()
    } catch {
      setError('Gagal terhubung ke server.')
    } finally {
      setProcessingId(null)
    }
  }

  async function handleSubmitRecurring(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/pengeluaran', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'recurring',
          nama: recNama,
          categoryId: recCategoryId,
          nominal: Number(recNominal),
          periodeAwal: recPeriodeAwal,
          periodeAkhir: recPeriodeAkhir,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Gagal menyimpan biaya berulang.')
        return
      }
      setRecNama('')
      setRecNominal('')
      notifySuccess('Biaya berulang dan alokasi harian berhasil ditambahkan.')
      await fetchPengeluaran()
    } catch {
      setError('Gagal terhubung ke server.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitPettyCash(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/pengeluaran', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pettyCash',
          tanggal: pcTanggal,
          jenis: pcJenis,
          nominal: Number(pcNominal),
          keterangan: pcKeterangan,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Gagal mencatat transaksi kas kecil.')
        return
      }
      setPcNominal('')
      setPcKeterangan('')
      notifySuccess('Transaksi kas kecil berhasil dicatat.')
      await fetchPengeluaran()
    } catch {
      setError('Gagal terhubung ke server.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitCategory(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/pengeluaran', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'category',
          nama: catNama,
          departemen: catDepartemen,
          kodeUsali: catKodeUsali,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Gagal menambah kategori.')
        return
      }
      setCatNama('')
      setCatKodeUsali('')
      notifySuccess('Kategori pengeluaran USALI berhasil ditambahkan.')
      await fetchPengeluaran()
    } catch {
      setError('Gagal terhubung ke server.')
    } finally {
      setSubmitting(false)
    }
  }

  const summary = useMemo(() => {
    let totalApproved = 0
    let operasional = 0
    let investasi = 0
    let pendingCount = 0

    for (const exp of expenses) {
      if (exp.statusApproval === 'PENDING') pendingCount++
      if (exp.statusApproval !== 'APPROVED') continue
      totalApproved += exp.nominal
      if (exp.jenisBeban === 'INVESTASI') investasi += exp.nominal
      else operasional += exp.nominal
    }
    return { totalApproved, operasional, investasi, pendingCount }
  }, [expenses])

  const previewAlokasi = useMemo(
    () => hitungPreviewAlokasi(recNominal, recPeriodeAwal, recPeriodeAkhir),
    [recNominal, recPeriodeAwal, recPeriodeAkhir]
  )

  const totalAlokasiHarianAktif = useMemo(
    () =>
      recurringExpenses
        .filter((r) => r.aktif)
        .reduce((sum, r) => sum + r.alokasiHarian, 0),
    [recurringExpenses]
  )

  const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'harian', label: 'Pengeluaran Harian', icon: Receipt },
    { key: 'berulang', label: 'Biaya Berulang', icon: CalendarClock },
    { key: 'kas-kecil', label: 'Kas Kecil', icon: Wallet },
    { key: 'kategori', label: 'Kategori (USALI)', icon: FolderTree },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Pengeluaran &amp; Kas Kecil
          </h1>
          <p className="text-sm text-slate-500">
            Catat pengeluaran harian, biaya berulang teralokasi, mutasi kas kecil, dan kategori USALI.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchPengeluaran}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Feedback banners */}
      {error && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Disetujui</p>
          <p className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
            {formatRupiah(summary.totalApproved)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Operasional: {formatRupiah(summary.operasional)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Beban Investasi (Capex)</p>
          <p className="text-lg sm:text-xl font-bold text-indigo-700 mt-1">
            {formatRupiah(summary.investasi)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Dipisah dari laba operasional</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Saldo Kas Kecil</p>
          <p className="text-lg sm:text-xl font-bold text-emerald-700 mt-1">
            {formatRupiah(pettyCashSaldo)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Alokasi berulang: {formatRupiah(totalAlokasiHarianAktif)}/hr</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Menunggu Persetujuan</p>
          <p className="text-lg sm:text-xl font-bold text-amber-600 mt-1">
            {summary.pendingCount} item
          </p>
          <p className="text-xs text-slate-400 mt-1">Pengeluaran &ge; Rp 1.000.000</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <nav className="flex gap-1 min-w-max" aria-label="Tabs Pengeluaran">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition cursor-pointer whitespace-nowrap ${
                  active
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* TAB 1: Pengeluaran Harian */}
      {activeTab === 'harian' && (
        <div className="space-y-6">
          {canWrite && (
            <form
              onSubmit={handleSubmitExpense}
              className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-indigo-600" />
                  <span>Input Cepat Pengeluaran Harian</span>
                </h2>
                <span className="text-xs text-slate-500">
                  Nominal &ge; Rp 1.000.000 perlu persetujuan Manajer/Owner
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    required
                    value={expTanggal}
                    onChange={(e) => setExpTanggal(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kategori Biaya
                  </label>
                  <select
                    required
                    value={expCategoryId}
                    onChange={(e) => setExpCategoryId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {categories.length === 0 && <option value="">Memuat kategori...</option>}
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nama} ({DEPARTEMEN_LABEL[cat.departemen] || cat.departemen})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nominal (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    step={1}
                    placeholder="Contoh: 150000"
                    value={expNominal}
                    onChange={(e) => setExpNominal(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Metode Bayar
                  </label>
                  <select
                    value={expMetodeBayar}
                    onChange={(e) =>
                      setExpMetodeBayar(e.target.value as 'TUNAI' | 'TRANSFER' | 'KAS_KECIL')
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="TUNAI">Tunai</option>
                    <option value="TRANSFER">Transfer Bank</option>
                    <option value="KAS_KECIL">Kas Kecil</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jenis Beban
                  </label>
                  <select
                    value={expJenisBeban}
                    onChange={(e) =>
                      setExpJenisBeban(e.target.value as 'OPERASIONAL' | 'INVESTASI')
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="OPERASIONAL">Operasional</option>
                    <option value="INVESTASI">Investasi (Capex)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Vendor / Toko (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Nama vendor/supplier"
                    value={expVendor}
                    onChange={(e) => setExpVendor(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Catatan / Keterangan (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Detail pembelian atau nomor nota"
                    value={expCatatan}
                    onChange={(e) => setExpCatatan(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !expCategoryId}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? 'Menyimpan...' : 'Simpan Pengeluaran'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dari Tanggal</label>
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sampai Tanggal</label>
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Departemen</label>
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="ALL">Semua Departemen</option>
                  <option value="KAMAR">Departemen Kamar</option>
                  <option value="FNB">Departemen F&amp;B</option>
                  <option value="TAK_TERDISTRIBUSI">Tak Terdistribusi</option>
                  <option value="TETAP">Biaya Tetap</option>
                </select>
              </div>
            </div>
            {(filterFrom || filterTo || filterDept !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setFilterFrom('')
                  setFilterTo('')
                  setFilterDept('ALL')
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg bg-slate-50 cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>

          {/* Expenses Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Daftar Pengeluaran ({expenses.length})
              </h3>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Memuat data...</div>
            ) : expenses.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Belum ada catatan pengeluaran.
              </div>
            ) : (
              <>
                {/* Mobile Card List */}
                <div className="divide-y divide-slate-200 md:hidden">
                  {expenses.map((exp) => (
                    <div key={exp.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {exp.category?.nama}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatTanggalPendek(exp.tanggal)} &bull;{' '}
                            {METODE_BAYAR_LABEL[exp.metodeBayar] || exp.metodeBayar}
                          </p>
                        </div>
                        <StatusBadge status={exp.statusApproval} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {exp.jenisBeban}
                        </span>
                        <span className="text-base font-bold text-slate-900">
                          {formatRupiah(exp.nominal)}
                        </span>
                      </div>
                      {(exp.vendor || exp.catatan) && (
                        <p className="text-xs text-slate-600">
                          {exp.vendor ? `Vendor: ${exp.vendor}` : ''}
                          {exp.vendor && exp.catatan ? ' — ' : ''}
                          {exp.catatan || ''}
                        </p>
                      )}
                      {exp.statusApproval === 'PENDING' && canApprove && (
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            disabled={processingId === exp.id}
                            onClick={() => handleApproval(exp.id, 'APPROVED')}
                            className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Setujui
                          </button>
                          <button
                            type="button"
                            disabled={processingId === exp.id}
                            onClick={() => handleApproval(exp.id, 'REJECTED')}
                            className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            Tolak
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Tanggal</th>
                        <th className="px-4 py-3 font-semibold">Kategori &amp; Dept</th>
                        <th className="px-4 py-3 font-semibold">Vendor / Catatan</th>
                        <th className="px-4 py-3 font-semibold">Metode &amp; Beban</th>
                        <th className="px-4 py-3 font-semibold text-right">Nominal</th>
                        <th className="px-4 py-3 font-semibold text-center">Status</th>
                        <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {expenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                            {formatTanggalPendek(exp.tanggal)}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{exp.category?.nama}</p>
                            <p className="text-xs text-slate-500">
                              {DEPARTEMEN_LABEL[exp.departemen] || exp.departemen}
                            </p>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="text-slate-800 truncate">{exp.vendor || '-'}</p>
                            {exp.catatan && (
                              <p className="text-xs text-slate-500 truncate">{exp.catatan}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="text-slate-800">
                              {METODE_BAYAR_LABEL[exp.metodeBayar] || exp.metodeBayar}
                            </p>
                            <span
                              className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                exp.jenisBeban === 'INVESTASI'
                                  ? 'bg-indigo-50 text-indigo-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {exp.jenisBeban}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-slate-900">
                            {formatRupiah(exp.nominal)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <StatusBadge status={exp.statusApproval} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            {exp.statusApproval === 'PENDING' && canApprove ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={processingId === exp.id}
                                  onClick={() => handleApproval(exp.id, 'APPROVED')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Setujui
                                </button>
                                <button
                                  type="button"
                                  disabled={processingId === exp.id}
                                  onClick={() => handleApproval(exp.id, 'REJECTED')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Tolak
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">
                                {exp.approvedBy?.nama ? `Oleh ${exp.approvedBy.nama}` : '-'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Biaya Berulang */}
      {activeTab === 'berulang' && (
        <div className="space-y-6">
          {canWrite && (
            <form
              onSubmit={handleSubmitRecurring}
              className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-indigo-600" />
                  <span>Tambah Biaya Berulang (Gaji, Listrik, Sewa, dll.)</span>
                </h2>
                {previewAlokasi > 0 && (
                  <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full">
                    Estimasi Alokasi Harian: {formatRupiah(previewAlokasi)} / hari
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Biaya
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Listrik PLN Bulan Ini"
                    value={recNama}
                    onChange={(e) => setRecNama(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kategori
                  </label>
                  <select
                    required
                    value={recCategoryId}
                    onChange={(e) => setRecCategoryId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nama}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nominal Total (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="Contoh: 15000000"
                    value={recNominal}
                    onChange={(e) => setRecNominal(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Periode Awal
                  </label>
                  <input
                    type="date"
                    required
                    value={recPeriodeAwal}
                    onChange={(e) => setRecPeriodeAwal(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Periode Akhir
                  </label>
                  <input
                    type="date"
                    required
                    value={recPeriodeAkhir}
                    onChange={(e) => setRecPeriodeAkhir(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !recCategoryId}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? 'Menyimpan...' : 'Simpan Biaya Berulang'}</span>
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Daftar Biaya Berulang &amp; Alokasi Harian ({recurringExpenses.length})
              </h3>
            </div>
            {recurringExpenses.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Belum ada biaya berulang yang dicatat.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Nama Biaya</th>
                      <th className="px-4 py-3 font-semibold">Kategori &amp; Dept</th>
                      <th className="px-4 py-3 font-semibold">Periode</th>
                      <th className="px-4 py-3 font-semibold text-right">Total Nominal</th>
                      <th className="px-4 py-3 font-semibold text-right">Alokasi Harian</th>
                      <th className="px-4 py-3 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {recurringExpenses.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-medium text-slate-900">{rec.nama}</td>
                        <td className="px-4 py-3">
                          <p className="text-slate-800">{rec.category?.nama}</p>
                          <p className="text-xs text-slate-500">
                            {DEPARTEMEN_LABEL[rec.category?.departemen] || rec.category?.departemen}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                          {formatTanggalPendek(rec.periodeAwal)} &ndash;{' '}
                          {formatTanggalPendek(rec.periodeAkhir)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-slate-800">
                          {formatRupiah(rec.nominal)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-indigo-700">
                          {formatRupiah(rec.alokasiHarian)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              rec.aktif
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {rec.aktif ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Kas Kecil */}
      {activeTab === 'kas-kecil' && (
        <div className="space-y-6">
          {/* Current Balance Card */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-indigo-200 font-medium">
                Saldo Kas Kecil Saat Ini
              </p>
              <p className="text-3xl font-bold mt-1">{formatRupiah(pettyCashSaldo)}</p>
              <p className="text-xs text-slate-300 mt-1">
                Pengeluaran dengan metode bayar &ldquo;Kas Kecil&rdquo; otomatis memotong saldo ini.
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Coins className="w-6 h-6 text-indigo-200" />
            </div>
          </div>

          {canWrite && (
            <form
              onSubmit={handleSubmitPettyCash}
              className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4"
            >
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-indigo-600" />
                <span>Mutasi &amp; Rekonsiliasi Kas Kecil</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    required
                    value={pcTanggal}
                    onChange={(e) => setPcTanggal(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jenis Transaksi
                  </label>
                  <select
                    value={pcJenis}
                    onChange={(e) =>
                      setPcJenis(
                        e.target.value as
                          | 'SALDO_AWAL'
                          | 'TOP_UP'
                          | 'PENGELUARAN'
                          | 'REKONSILIASI'
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="SALDO_AWAL">Saldo Awal (Set Saldo)</option>
                    <option value="TOP_UP">Top Up (Tambah Saldo)</option>
                    <option value="PENGELUARAN">Pengeluaran (Kurangi Saldo)</option>
                    <option value="REKONSILIASI">Rekonsiliasi (Sesuaikan Saldo Akhir)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nominal (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    min={pcJenis === 'SALDO_AWAL' || pcJenis === 'REKONSILIASI' ? 0 : 1}
                    placeholder="Nominal"
                    value={pcNominal}
                    onChange={(e) => setPcNominal(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Keterangan
                  </label>
                  <input
                    type="text"
                    placeholder="Keterangan mutasi"
                    value={pcKeterangan}
                    onChange={(e) => setPcKeterangan(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? 'Menyimpan...' : 'Catat Kas Kecil'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Ledger Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">
                Buku Kas Kecil ({pettyCash.length})
              </h3>
            </div>
            {pettyCash.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Belum ada mutasi kas kecil.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Tanggal</th>
                      <th className="px-4 py-3 font-semibold">Jenis</th>
                      <th className="px-4 py-3 font-semibold">Keterangan</th>
                      <th className="px-4 py-3 font-semibold text-right">Nominal</th>
                      <th className="px-4 py-3 font-semibold text-right">Saldo Berjalan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {pettyCash.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                          {formatTanggalPendek(item.tanggal)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              item.jenis === 'TOP_UP' || item.jenis === 'SALDO_AWAL'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.jenis === 'PENGELUARAN'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {PETTY_CASH_JENIS_LABEL[item.jenis] || item.jenis}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {item.keterangan || '-'}
                        </td>
                        <td
                          className={`px-4 py-3 whitespace-nowrap text-right font-medium ${
                            item.jenis === 'PENGELUARAN' ? 'text-red-600' : 'text-slate-900'
                          }`}
                        >
                          {item.jenis === 'PENGELUARAN' ? '- ' : ''}
                          {formatRupiah(item.nominal)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-slate-900">
                          {formatRupiah(item.saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Kategori USALI */}
      {activeTab === 'kategori' && (
        <div className="space-y-6">
          {canWrite && (
            <form
              onSubmit={handleSubmitCategory}
              className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4"
            >
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-indigo-600" />
                <span>Tambah Kategori Pengeluaran (USALI)</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Kategori
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Perlengkapan Kolam Renang"
                    value={catNama}
                    onChange={(e) => setCatNama(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Departemen USALI
                  </label>
                  <select
                    value={catDepartemen}
                    onChange={(e) =>
                      setCatDepartemen(
                        e.target.value as 'KAMAR' | 'FNB' | 'TAK_TERDISTRIBUSI' | 'TETAP'
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="KAMAR">Departemen Kamar (ROOMS)</option>
                    <option value="FNB">Departemen F&amp;B (F&amp;B)</option>
                    <option value="TAK_TERDISTRIBUSI">Tak Terdistribusi (A&amp;G/UTIL/POM/S&amp;M)</option>
                    <option value="TETAP">Biaya Tetap (FIXED)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kode USALI (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: ROOMS, F&B, A&G, UTIL, POM, FIXED"
                    value={catKodeUsali}
                    onChange={(e) => setCatKodeUsali(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{submitting ? 'Menyimpan...' : 'Tambah Kategori'}</span>
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">
                Daftar Kategori Biaya USALI ({categories.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nama Kategori</th>
                    <th className="px-4 py-3 font-semibold">Departemen USALI</th>
                    <th className="px-4 py-3 font-semibold">Kode USALI</th>
                    <th className="px-4 py-3 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">{cat.nama}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {DEPARTEMEN_LABEL[cat.departemen] || cat.departemen}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-xs">
                          {cat.kodeUsali || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {cat.aktif ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'APPROVED') {
    return (
      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        APPROVED
      </span>
    )
  }
  if (status === 'REJECTED') {
    return (
      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        REJECTED
      </span>
    )
  }
  return (
    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      PENDING
    </span>
  )
}
