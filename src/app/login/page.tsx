'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Hotel, Lock, User, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login gagal')
        setLoading(false)
        return
      }

      if (data.user?.role === 'RESEPSIONIS') {
        router.push('/reservasi')
      } else if (data.user?.role === 'ADMIN_KEUANGAN') {
        router.push('/pengeluaran')
      } else {
        router.push('/laporan')
      }
      router.refresh()
    } catch {
      setError('Gagal terhubung ke server')
      setLoading(false)
    }
  }

  function fillDemo(user: string) {
    setUsername(user)
    setPassword('admin123')
    setError('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
            <Hotel className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Sistem Manajemen Hotel</h1>
          <p className="text-sm text-slate-500">Operasional Harian &amp; Laporan Laba</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username"
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password"
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-lg text-sm transition cursor-pointer"
          >
            {loading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-200">
          <p className="text-xs text-slate-500 mb-2 text-center">Akun Demo (password: <code className="bg-slate-100 px-1 rounded">admin123</code>)</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => fillDemo('owner')} className="text-xs py-1.5 px-2 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer">
              Owner
            </button>
            <button type="button" onClick={() => fillDemo('manajer')} className="text-xs py-1.5 px-2 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer">
              Manajer
            </button>
            <button type="button" onClick={() => fillDemo('resepsionis')} className="text-xs py-1.5 px-2 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer">
              Resepsionis
            </button>
            <button type="button" onClick={() => fillDemo('keuangan')} className="text-xs py-1.5 px-2 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 cursor-pointer">
              Keuangan
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
