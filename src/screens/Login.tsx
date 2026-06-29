import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Logo } from '../components/ui'
import { IconArrow, IconBrain } from '../components/icons'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Login() {
  const login = useStore((s) => s.login)
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    login(email || 'demo@terrainpro.au', name)
    // First-run onboarding: a brand-new contractor (no business set up, no
    // quotes yet) goes straight into the sequential Business setup wizard.
    const { business, quotes } = useStore.getState()
    const firstRun = !business.configured && quotes.length === 0
    navigate(firstRun ? '/business' : '/')
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink-900">
      {/* Subtle construction-grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(#6FA86F 1px, transparent 1px), linear-gradient(90deg, #6FA86F 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Logo size={44} />
          </div>

          <div className="card p-6 sm:p-7 animate-fade-up">
            <div className="mb-1 flex items-center gap-2 text-sage-400">
              <IconBrain size={18} />
              <span className="text-xs font-bold uppercase tracking-wide">AI Quoting Assistant</span>
            </div>
            <h1 className="text-xl font-extrabold text-slate-100">Quote faster. Stop underquoting.</h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Sign in to your TerrainPro workspace. Your switched-on apprentice is ready to price the next job.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@yourcompany.com.au"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label">Name / Business</label>
                <input
                  className="input"
                  placeholder="e.g. Dave — Terrain Contracting"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary w-full">
                Enter workspace <IconArrow size={18} />
              </button>
            </form>

            <div className="mt-5 flex items-center gap-2 text-xs text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${isSupabaseConfigured ? 'bg-sage-500' : 'bg-amber'}`} />
              {isSupabaseConfigured
                ? 'Connected to Supabase — cloud sync on.'
                : 'Demo mode — data saved on this device. Add Supabase keys to sync.'}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-600">
            Built for Australian concreting, landscaping &amp; earthworks crews.
          </p>
        </div>
      </div>
    </div>
  )
}
