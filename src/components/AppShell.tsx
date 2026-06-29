// Responsive shell: sidebar on desktop, bottom tab bar on mobile.
// Mobile-first — the bottom nav is the primary navigation on a phone on site.

import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Logo } from './ui'
import {
  IconBrain,
  IconDashboard,
  IconDoc,
  IconHard,
  IconLogout,
  IconPlus,
  IconSettings,
} from './icons'
import { useStore } from '../store/useStore'

const nav = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/new', label: 'New Quote', icon: IconPlus, end: false },
  { to: '/quotes', label: 'Quotes', icon: IconDoc, end: false },
  { to: '/business', label: 'Business', icon: IconHard, end: false },
  { to: '/settings', label: 'Settings', icon: IconSettings, end: false },
]

export default function AppShell({ children }: { children: ReactNode }) {
  const user = useStore((s) => s.user)
  const logout = useStore((s) => s.logout)
  const navigate = useNavigate()

  return (
    <div className="min-h-full bg-ink-900">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-ink-400 bg-ink-800 px-4 py-5 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-sage-500/15 text-sage-400' : 'text-slate-400 hover:bg-ink-600 hover:text-slate-200'
                }`
              }
            >
              <n.icon size={19} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-ink-400 pt-4">
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-500/20 text-sm font-bold text-sage-400">
              {(user?.name || 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-slate-200">{user?.name}</div>
              <div className="truncate text-xs text-slate-500">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={() => {
              logout()
              navigate('/login')
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-ink-600 hover:text-danger"
          >
            <IconLogout size={18} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-400 bg-ink-800/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo size={26} />
        <button
          onClick={() => navigate('/new')}
          className="flex items-center gap-1.5 rounded-full bg-sage-500/15 px-3 py-1.5 text-xs font-bold text-sage-400"
        >
          <IconBrain size={15} /> Apprentice
        </button>
      </header>

      {/* Main content */}
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-ink-400 bg-ink-800/95 backdrop-blur lg:hidden">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition ${
                isActive ? 'text-sage-400' : 'text-slate-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={n.label === 'New Quote' && isActive ? 'rounded-full bg-sage-500 p-1.5 text-ink-900' : n.label === 'New Quote' ? 'rounded-full bg-ink-500 p-1.5' : ''}>
                  <n.icon size={n.label === 'New Quote' ? 18 : 20} />
                </span>
                {n.label === 'New Quote' ? 'New' : n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
