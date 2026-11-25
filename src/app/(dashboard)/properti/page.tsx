'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  History,
  Percent,
  Save,
} from 'lucide-react'
import { formatPersen, formatTanggalPendek } from '@/lib/format'

interface PropertyData {
  id: string
  nama: string
  alamat: string | null
  kota: string | null
  provinsi: string | null
  zonaWaktu: string
  jamCheckIn: string
  jamCheckOut: string
  cutOffHariBisnis: string
  mataUang: string
  telepon: string | null
  email: string | null
}

interface TaxConfigData {
  id: string
  pajakDaerahPct: number
  serviceChargePct: number
  modeHarga: 'EXCLUSIVE' | 'INCLUSIVE' | string
  berlakuSejak: string
  aktif: boolean
}

interface PropertyFormState {
  nama: string
  alamat: string
  kota: string
  provinsi: string
  zonaWaktu: string
  jamCheckIn: string
  jamCheckOut: string
  cutOffHariBisnis: string
  telepon: string
  email: string
}

interface TaxFormState {
  pajakDaerahPct: string
  serviceChargePct: string
  modeHarga: 'EXCLUSIVE' | 'INCLUSIVE'
}

const ZONA_WAKTU_OPTIONS = [
  { value: 'Asia/Jakarta', label: 'WIB — Asia/Jakarta (UTC+7)' },
  { value: 'Asia/Makassar', label: 'WITA — Asia/Makassar (UTC+8)' },
  { value: 'Asia/Jayapura', label: 'WIT — Asia/Jayapura (UTC+9)' },
]

function formatWaktu(dateStr: string): string {
  const d = new Date(dateStr)
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export default function PropertiPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [propertyForm, setPropertyForm] = useState<PropertyFormState>({
    nama: '',
    alamat: '',
    kota: '',
    provinsi: '',
    zonaWaktu: 'Asia/Jakarta',
    jamCheckIn: '14:00',
    jamCheckOut: '12:00',
    cutOffHariBisnis: '06:00',
    telepon: '',
    email: '',
  })

  const [taxForm, setTaxForm] = useState<TaxFormState>({
    pajakDaerahPct: '10',
    serviceChargePct: '10',
    modeHarga: 'EXCLUSIVE',
  })

  const [taxHistory, setTaxHistory] = useState<TaxConfigData[]>([])

  const [savingProperty, setSavingProperty] = useState(false)
  const [propertyMessage, setPropertyMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const [savingTax, setSavingTax] = useState(false)
  const [taxMessage, setTaxMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  useEffect(() => {
    let active = true

    async function fetchProperti() {
      try {
        const res = await fetch('/api/properti')
        const data = await res.json()

        if (!res.ok) {
          if (active) setLoadError(data.error || 'Gagal memuat data properti.')
          return
        }

        if (!active) return

        const prop: PropertyData | null = data.property
        if (prop) {
          setPropertyForm({
            nama: prop.nama ?? '',
            alamat: prop.alamat ?? '',
            kota: prop.kota ?? '',
            provinsi: prop.provinsi ?? '',
            zonaWaktu: prop.zonaWaktu || 'Asia/Jakarta',
            jamCheckIn: prop.jamCheckIn || '14:00',
            jamCheckOut: prop.jamCheckOut || '12:00',
            cutOffHariBisnis: prop.cutOffHariBisnis || '06:00',
            telepon: prop.telepon ?? '',
            email: prop.email ?? '',
          })
        }

        const tax: TaxConfigData | null = data.taxConfig
        if (tax) {
          setTaxForm({
            pajakDaerahPct: String(tax.pajakDaerahPct),
            serviceChargePct: String(tax.serviceChargePct),
            modeHarga: tax.modeHarga === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE',
          })
        }

        setTaxHistory(Array.isArray(data.taxHistory) ? data.taxHistory : [])
      } catch {
        if (active) setLoadError('Gagal terhubung ke server.')
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchProperti()
    return () => {
      active = false
    }
  }, [])

  async function handleSaveProperty(e: React.FormEvent) {
    e.preventDefault()
    setPropertyMessage(null)
    setSavingProperty(true)

    try {
      const res = await fetch('/api/properti', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(propertyForm),
      })
      const data = await res.json()

      if (!res.ok) {
        setPropertyMessage({
          type: 'error',
          text: data.error || 'Gagal menyimpan profil properti.',
        })
        return
      }

      if (data.property) {
        const p: PropertyData = data.property
        setPropertyForm({
          nama: p.nama ?? '',
          alamat: p.alamat ?? '',
          kota: p.kota ?? '',
          provinsi: p.provinsi ?? '',
          zonaWaktu: p.zonaWaktu || 'Asia/Jakarta',
          jamCheckIn: p.jamCheckIn || '14:00',
          jamCheckOut: p.jamCheckOut || '12:00',
          cutOffHariBisnis: p.cutOffHariBisnis || '06:00',
          telepon: p.telepon ?? '',
          email: p.email ?? '',
        })
      }

      setPropertyMessage({
        type: 'success',
        text: 'Profil properti berhasil diperbarui.',
      })
    } catch {
      setPropertyMessage({
        type: 'error',
        text: 'Terjadi kesalahan jaringan saat menyimpan properti.',
      })
    } finally {
      setSavingProperty(false)
    }
  }

  async function handleSaveTax(e: React.FormEvent) {
    e.preventDefault()
    setTaxMessage(null)
    setSavingTax(true)

    try {
      const res = await fetch('/api/properti', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxConfig: {
            pajakDaerahPct: Number(taxForm.pajakDaerahPct),
            serviceChargePct: Number(taxForm.serviceChargePct),
            modeHarga: taxForm.modeHarga,
          },
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setTaxMessage({
          type: 'error',
          text: data.error || 'Gagal menyimpan pengaturan pajak.',
        })
        return
      }

      if (data.taxConfig) {
        setTaxForm({
          pajakDaerahPct: String(data.taxConfig.pajakDaerahPct),
          serviceChargePct: String(data.taxConfig.serviceChargePct),
          modeHarga:
            data.taxConfig.modeHarga === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE',
        })
      }
      if (Array.isArray(data.taxHistory)) {
        setTaxHistory(data.taxHistory)
      }

      setTaxMessage({
        type: 'success',
        text: 'Pengaturan pajak & service charge berhasil diperbarui.',
      })
    } catch {
      setTaxMessage({
        type: 'error',
        text: 'Terjadi kesalahan jaringan saat menyimpan pengaturan pajak.',
      })
    } finally {
      setSavingTax(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-white rounded-xl border border-slate-200 animate-pulse" />
          <div className="h-96 bg-white rounded-xl border border-slate-200 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-indigo-600" />
            <span>Setup Properti &amp; Pajak</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Kelola profil hotel, jam operasional, dan konfigurasi pajak serta service charge.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Profil Properti */}
        <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50/70">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Profil Properti</h2>
          </div>

          <form onSubmit={handleSaveProperty} className="p-5 space-y-4">
            {propertyMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${
                  propertyMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {propertyMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{propertyMessage.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nama Properti / Hotel <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={propertyForm.nama}
                  onChange={(e) =>
                    setPropertyForm((prev) => ({ ...prev, nama: e.target.value }))
                  }
                  placeholder="Contoh: Hotel Nusantara"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Alamat Lengkap
                </label>
                <textarea
                  rows={2}
                  value={propertyForm.alamat}
                  onChange={(e) =>
                    setPropertyForm((prev) => ({ ...prev, alamat: e.target.value }))
                  }
                  placeholder="Jalan, nomor, kelurahan/kecamatan"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Kota / Kabupaten
                </label>
                <input
                  type="text"
                  value={propertyForm.kota}
                  onChange={(e) =>
                    setPropertyForm((prev) => ({ ...prev, kota: e.target.value }))
                  }
                  placeholder="Contoh: Jakarta"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Provinsi
                </label>
                <input
                  type="text"
                  value={propertyForm.provinsi}
                  onChange={(e) =>
                    setPropertyForm((prev) => ({ ...prev, provinsi: e.target.value }))
                  }
                  placeholder="Contoh: DKI Jakarta"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Telepon
                </label>
                <input
                  type="text"
                  value={propertyForm.telepon}
                  onChange={(e) =>
                    setPropertyForm((prev) => ({ ...prev, telepon: e.target.value }))
                  }
                  placeholder="Contoh: 021-5550123"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email Properti
                </label>
                <input
                  type="email"
                  value={propertyForm.email}
                  onChange={(e) =>
                    setPropertyForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="reservasi@hotel.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3">
                <Clock className="w-3.5 h-3.5" />
                <span>Operasional &amp; Zona Waktu</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Zona Waktu
                  </label>
                  <select
                    value={propertyForm.zonaWaktu}
                    onChange={(e) =>
                      setPropertyForm((prev) => ({
                        ...prev,
                        zonaWaktu: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ZONA_WAKTU_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Jam Check-In
                  </label>
                  <input
                    type="time"
                    value={propertyForm.jamCheckIn}
                    onChange={(e) =>
                      setPropertyForm((prev) => ({
                        ...prev,
                        jamCheckIn: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Jam Check-Out
                  </label>
                  <input
                    type="time"
                    value={propertyForm.jamCheckOut}
                    onChange={(e) =>
                      setPropertyForm((prev) => ({
                        ...prev,
                        jamCheckOut: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Cut-Off Hari Bisnis
                  </label>
                  <input
                    type="time"
                    value={propertyForm.cutOffHariBisnis}
                    onChange={(e) =>
                      setPropertyForm((prev) => ({
                        ...prev,
                        cutOffHariBisnis: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingProperty}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{savingProperty ? 'Menyimpan...' : 'Simpan Profil Properti'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Form Pengaturan Pajak & Service Charge */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50/70">
            <Percent className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Pajak &amp; Service Charge</h2>
          </div>

          <form onSubmit={handleSaveTax} className="p-5 space-y-4">
            {taxMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${
                  taxMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {taxMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{taxMessage.text}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Pajak Daerah / PB1 (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                required
                value={taxForm.pajakDaerahPct}
                onChange={(e) =>
                  setTaxForm((prev) => ({ ...prev, pajakDaerahPct: e.target.value }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Service Charge (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                required
                value={taxForm.serviceChargePct}
                onChange={(e) =>
                  setTaxForm((prev) => ({
                    ...prev,
                    serviceChargePct: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Mode Harga
              </label>
              <div className="space-y-2">
                <label className="flex items-start gap-2.5 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="modeHarga"
                    value="EXCLUSIVE"
                    checked={taxForm.modeHarga === 'EXCLUSIVE'}
                    onChange={() =>
                      setTaxForm((prev) => ({ ...prev, modeHarga: 'EXCLUSIVE' }))
                    }
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-slate-800">
                      EXCLUSIVE (Belum Termasuk Pajak)
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      Pajak &amp; service charge ditambahkan di atas tarif dasar.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="modeHarga"
                    value="INCLUSIVE"
                    checked={taxForm.modeHarga === 'INCLUSIVE'}
                    onChange={() =>
                      setTaxForm((prev) => ({ ...prev, modeHarga: 'INCLUSIVE' }))
                    }
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-slate-800">
                      INCLUSIVE (Sudah Termasuk Pajak)
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      Tarif jual sudah mencakup komponen pajak &amp; service charge.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingTax}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{savingTax ? 'Menyimpan...' : 'Simpan Pengaturan Pajak'}</span>
            </button>
          </form>
        </section>
      </div>

      {/* Table Riwayat Perubahan Pajak */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Riwayat Perubahan Pajak</h2>
          </div>
          <span className="text-xs text-slate-500">{taxHistory.length} entri</span>
        </div>

        {taxHistory.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Belum ada riwayat perubahan konfigurasi pajak.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-semibold">Berlaku Sejak</th>
                  <th className="px-5 py-3 font-semibold">Pajak Daerah</th>
                  <th className="px-5 py-3 font-semibold">Service Charge</th>
                  <th className="px-5 py-3 font-semibold">Mode Harga</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {taxHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3 text-slate-800 whitespace-nowrap">
                      <span className="font-medium">
                        {formatTanggalPendek(item.berlakuSejak)}
                      </span>{' '}
                      <span className="text-xs text-slate-500">
                        {formatWaktu(item.berlakuSejak)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-800 font-medium">
                      {formatPersen(item.pajakDaerahPct)}
                    </td>
                    <td className="px-5 py-3 text-slate-800 font-medium">
                      {formatPersen(item.serviceChargePct)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.modeHarga === 'INCLUSIVE'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.modeHarga === 'INCLUSIVE'
                          ? 'INCLUSIVE'
                          : 'EXCLUSIVE'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {item.aktif ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          Riwayat
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
