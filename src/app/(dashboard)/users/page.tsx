'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react'
import { formatTanggalPendek } from '@/lib/format'

type UserRole = 'OWNER' | 'MANAJER' | 'RESEPSIONIS' | 'ADMIN_KEUANGAN'

interface UserItem {
  id: string
  username: string
  email: string | null
  nama: string
  role: UserRole
  aktif: boolean
  createdAt: string
}

interface AuditLogItem {
  id: string
  userId: string
  user: {
    nama: string
    username: string
    role: string
  } | null
  aksi: string
  entitas: string
  entitasId: string | null
  keterangan: string | null
  createdAt: string
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'MANAJER', label: 'Manajer' },
  { value: 'RESEPSIONIS', label: 'Resepsionis' },
  { value: 'ADMIN_KEUANGAN', label: 'Admin Keuangan' },
]

const AKSI_OPTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'VOID',
  'LOGIN',
  'CLOSE_DAY',
  'REOPEN_DAY',
]

const ENTITAS_OPTIONS = [
  'User',
  'Property',
  'TaxConfig',
  'RoomType',
  'Room',
  'RatePlan',
  'RateCalendar',
  'Guest',
  'Reservation',
  'Folio',
  'FolioCharge',
  'Payment',
  'ExpenseCategory',
  'Expense',
  'RecurringExpense',
  'DailyClose',
  'PettyCash',
]

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'OWNER':
      return 'bg-purple-100 text-purple-800'
    case 'MANAJER':
      return 'bg-indigo-100 text-indigo-800'
    case 'ADMIN_KEUANGAN':
      return 'bg-emerald-100 text-emerald-800'
    case 'RESEPSIONIS':
      return 'bg-sky-100 text-sky-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function getAksiBadgeClass(aksi: string): string {
  switch (aksi) {
    case 'CREATE':
      return 'bg-emerald-100 text-emerald-800'
    case 'UPDATE':
      return 'bg-sky-100 text-sky-800'
    case 'DELETE':
    case 'VOID':
      return 'bg-red-100 text-red-800'
    case 'CLOSE_DAY':
      return 'bg-indigo-100 text-indigo-800'
    case 'REOPEN_DAY':
      return 'bg-amber-100 text-amber-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function formatJam(dateStr: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

export default function UsersAndAuditPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users')

  // State Tab 1: Pengguna
  const [users, setUsers] = useState<UserItem[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [userError, setUserError] = useState('')
  const [userFeedback, setUserFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [formNama, setFormNama] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('RESEPSIONIS')
  const [submittingUser, setSubmittingUser] = useState(false)

  // State Tab 2: Audit Log
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [auditError, setAuditError] = useState('')
  const [filterAksi, setFilterAksi] = useState('')
  const [filterEntitas, setFilterEntitas] = useState('')

  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true)
      const res = await fetch('/api/users')
      const data = await res.json()
      if (!res.ok) {
        setUserError(data.error || 'Gagal memuat daftar pengguna.')
        return
      }
      setUsers(Array.isArray(data.users) ? data.users : [])
      setUserError('')
    } catch {
      setUserError('Gagal terhubung ke server.')
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  const fetchAudit = useCallback(async (aksi: string, entitas: string) => {
    try {
      setLoadingAudit(true)
      const params = new URLSearchParams()
      if (aksi) params.set('aksi', aksi)
      if (entitas) params.set('entitas', entitas)
      const query = params.toString()
      const res = await fetch(`/api/audit${query ? `?${query}` : ''}`)
      const data = await res.json()
      if (!res.ok) {
        setAuditError(data.error || 'Gagal memuat audit log.')
        return
      }
      setLogs(Array.isArray(data.logs) ? data.logs : [])
      setAuditError('')
    } catch {
      setAuditError('Gagal terhubung ke server.')
    } finally {
      setLoadingAudit(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAudit(filterAksi, filterEntitas)
    }
  }, [activeTab, filterAksi, filterEntitas, fetchAudit])

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setUserFeedback(null)
    setSubmittingUser(true)

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: formNama,
          username: formUsername,
          email: formEmail || undefined,
          password: formPassword,
          role: formRole,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setUserFeedback({
          type: 'error',
          text: data.error || 'Gagal menambahkan pengguna.',
        })
        return
      }

      setFormNama('')
      setFormUsername('')
      setFormEmail('')
      setFormPassword('')
      setFormRole('RESEPSIONIS')
      setUserFeedback({
        type: 'success',
        text: `Pengguna ${data.user?.username ?? ''} berhasil ditambahkan.`,
      })
      await fetchUsers()
    } catch {
      setUserFeedback({
        type: 'error',
        text: 'Terjadi kesalahan jaringan saat menambahkan pengguna.',
      })
    } finally {
      setSubmittingUser(false)
    }
  }

  async function handleToggleAktif(user: UserItem) {
    setUserFeedback(null)
    setTogglingId(user.id)

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktif: !user.aktif }),
      })
      const data = await res.json()

      if (!res.ok) {
        setUserFeedback({
          type: 'error',
          text: data.error || 'Gagal mengubah status pengguna.',
        })
        return
      }

      setUserFeedback({
        type: 'success',
        text: `Status pengguna ${user.nama} berhasil ${
          !user.aktif ? 'diaktifkan' : 'dinonaktifkan'
        }.`,
      })
      await fetchUsers()
    } catch {
      setUserFeedback({
        type: 'error',
        text: 'Terjadi kesalahan jaringan saat memperbarui status pengguna.',
      })
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            <span>Pengguna &amp; Audit Log</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Kelola akses akun staf hotel serta pantau jejak aktivitas sistem.
          </p>
        </div>

        {/* Tabs */}
        <div className="inline-flex p-1 bg-slate-200/70 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              activeTab === 'users'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Manajemen Pengguna</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Audit Log</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Manajemen Pengguna */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {userError && (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{userError}</span>
            </div>
          )}

          {userFeedback && (
            <div
              className={`flex items-center gap-2 p-3.5 rounded-xl text-sm border ${
                userFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {userFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{userFeedback.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daftar Pengguna */}
            <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <h2 className="font-semibold text-slate-900">Daftar Pengguna</h2>
                </div>
                <span className="text-xs text-slate-500">{users.length} akun</span>
              </div>

              {loadingUsers ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-12 bg-slate-100 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Belum ada data pengguna.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Nama</th>
                        <th className="px-5 py-3 font-semibold">Username</th>
                        <th className="px-5 py-3 font-semibold">Role</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                        <th className="px-5 py-3 font-semibold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-3">
                            <div className="font-medium text-slate-900">{u.nama}</div>
                            {u.email && (
                              <div className="text-xs text-slate-500">{u.email}</div>
                            )}
                          </td>
                          <td className="px-5 py-3 text-slate-700 font-mono text-xs">
                            {u.username}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeClass(
                                u.role
                              )}`}
                            >
                              {u.role.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            {u.aktif ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                Aktif
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
                                Nonaktif
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              disabled={togglingId === u.id}
                              onClick={() => handleToggleAktif(u)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                                u.aktif
                                  ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                              }`}
                            >
                              {u.aktif ? (
                                <>
                                  <UserX className="w-3.5 h-3.5" />
                                  <span>Nonaktifkan</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Aktifkan</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Form Tambah Pengguna */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-fit">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50/70">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                <h2 className="font-semibold text-slate-900">Tambah Pengguna</h2>
              </div>

              <form onSubmit={handleAddUser} className="p-5 space-y-3.5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formNama}
                    onChange={(e) => setFormNama(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="Contoh: budi"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="budi@hotel.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={submittingUser}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{submittingUser ? 'Menambahkan...' : 'Tambah Pengguna'}</span>
                </button>

                <p className="text-xs text-slate-500">
                  Catatan: Penambahan dan perubahan status akun hanya diizinkan untuk role Owner.
                </p>
              </form>
            </section>
          </div>
        </div>
      )}

      {/* Tab 2: Audit Log */}
      {activeTab === 'audit' && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-slate-900">Riwayat Audit Log</h2>
              <span className="text-xs text-slate-500">
                (Maks 100 aktivitas terbaru)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter aksi"
                value={filterAksi}
                onChange={(e) => setFilterAksi(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Semua Aksi</option>
                {AKSI_OPTIONS.map((aksi) => (
                  <option key={aksi} value={aksi}>
                    {aksi}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter entitas"
                value={filterEntitas}
                onChange={(e) => setFilterEntitas(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Semua Entitas</option>
                {ENTITAS_OPTIONS.map((entitas) => (
                  <option key={entitas} value={entitas}>
                    {entitas}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => fetchAudit(filterAksi, filterEntitas)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Muat Ulang</span>
              </button>
            </div>
          </div>

          {auditError && (
            <div className="m-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{auditError}</span>
            </div>
          )}

          {loadingAudit ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-10 bg-slate-100 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Tidak ada catatan audit log yang sesuai filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Waktu</th>
                    <th className="px-5 py-3 font-semibold">Pengguna</th>
                    <th className="px-5 py-3 font-semibold">Aksi</th>
                    <th className="px-5 py-3 font-semibold">Entitas</th>
                    <th className="px-5 py-3 font-semibold">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 whitespace-nowrap text-slate-800">
                        <span className="font-medium">
                          {formatTanggalPendek(log.createdAt)}
                        </span>{' '}
                        <span className="text-xs text-slate-500">
                          {formatJam(log.createdAt)}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {log.user?.nama ?? '-'}
                        </div>
                        {log.user?.username && (
                          <div className="text-xs text-slate-500">
                            @{log.user.username}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getAksiBadgeClass(
                            log.aksi
                          )}`}
                        >
                          {log.aksi}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap font-mono text-xs text-slate-700">
                        {log.entitas}
                      </td>
                      <td className="px-5 py-3 text-slate-700 max-w-md">
                        {log.keterangan || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
