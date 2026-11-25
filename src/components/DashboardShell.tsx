'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  BedDouble,
  Building2,
  CalendarCheck,
  CreditCard,
  DollarSign,
  LogOut,
  Menu,
  Moon,
  Receipt,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import type { AuthUser } from '@/lib/auth'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles: string[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/laporan', label: 'Daily Flash & Laporan', icon: BarChart3, roles: ['OWNER', 'MANAJER', 'ADMIN_KEUANGAN'] },
  { href: '/reservasi', label: 'Reservasi & Front Desk', icon: CalendarCheck, roles: ['OWNER', 'MANAJER', 'RESEPSIONIS', 'ADMIN_KEUANGAN'] },
  { href: '/folio', label: 'Folio & Kasir', icon: Receipt, roles: ['OWNER', 'MANAJER', 'RESEPSIONIS', 'ADMIN_KEUANGAN'] },
  { href: '/tamu', label: 'Data Tamu', icon: Users, roles: ['OWNER', 'MANAJER', 'RESEPSIONIS', 'ADMIN_KEUANGAN'] },
  { href: '/pengeluaran', label: 'Pengeluaran & Kas Kecil', icon: DollarSign, roles: ['OWNER', 'MANAJER', 'ADMIN_KEUANGAN', 'RESEPSIONIS'] },
  { href: '/tutup-hari', label: 'Tutup Hari (Night Audit)', icon: Moon, roles: ['OWNER', 'MANAJER', 'ADMIN_KEUANGAN'] },
  { href: '/kamar', label: 'Master Kamar', icon: BedDouble, roles: ['OWNER', 'MANAJER', 'RESEPSIONIS', 'ADMIN_KEUANGAN'] },
  { href: '/tarif', label: 'Tarif & Rate Plan', icon: CreditCard, roles: ['OWNER', 'MANAJER', 'RESEPSIONIS', 'ADMIN_KEUANGAN'] },
  { href: '/properti', label: 'Setup Properti & Pajak', icon: Building2, roles: ['OWNER', 'MANAJER'] },
  { href: '/users', label: 'Pengguna & Audit Log', icon: ShieldCheck, roles: ['OWNER', 'MANAJER'] },
]

export default function DashboardShell({
  user,
  children,
}: {
  user: AuthUser
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const allowedNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role))

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between bg-slate-900 text-white px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center gap-2 font-semibold text-base">
          <Building2 className="w-5 h-5 text-indigo-400" />
          <span>Hotel Ops &amp; Laba</span>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 rounded-lg hover:bg-slate-800"
          aria-label="Toggle Menu"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Backdrop on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-40 h-screen w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">Sistem Hotel</p>
              <p className="text-xs text-slate-400">Fase 1 MVP</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {allowedNav.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="text-xs">
            <p className="font-semibold text-white truncate">{user.nama}</p>
            <p className="text-slate-400">{user.role.replace('_', ' ')}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-red-600/80 text-slate-200 hover:text-white text-xs font-medium transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  )
}
