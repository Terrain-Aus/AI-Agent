import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Card, SectionTitle } from '../components/ui'
import { IconLogout, IconSettings } from '../components/icons'
import { isSupabaseConfigured } from '../lib/supabase'
import { aiProvider, isLiveAI } from '../lib/ai'

export default function Settings() {
  const navigate = useNavigate()
  const profile = useStore((s) => s.profile)
  const updateProfile = useStore((s) => s.updateProfile)
  const logout = useStore((s) => s.logout)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sage-400">
        <IconSettings size={18} />
        <span className="text-xs font-bold uppercase tracking-wide">Settings</span>
      </div>
      <h1 className="-mt-3 text-2xl font-extrabold text-slate-100">Business profile</h1>

      <Card>
        <SectionTitle hint="shown on every quote &amp; invoice">Company details</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" value={profile.businessName} onChange={(v) => updateProfile({ businessName: v })} />
          <Field label="Contact name" value={profile.contactName} onChange={(v) => updateProfile({ contactName: v })} />
          <Field label="ABN" value={profile.abn} onChange={(v) => updateProfile({ abn: v })} />
          <Field label="Licence (QBCC etc.)" value={profile.licence} onChange={(v) => updateProfile({ licence: v })} />
          <Field label="Phone" value={profile.phone} onChange={(v) => updateProfile({ phone: v })} />
          <Field label="Email" value={profile.email} onChange={(v) => updateProfile({ email: v })} />
        </div>
      </Card>

      <Card>
        <SectionTitle>Integrations</SectionTitle>
        <div className="space-y-3">
          <IntegrationRow
            name="Supabase"
            desc="Cloud auth, sync &amp; cross-device quotes"
            on={isSupabaseConfigured}
            onLabel="Connected"
            offLabel="Demo (local only)"
          />
          <IntegrationRow
            name="AI model"
            desc={isLiveAI ? `Live ${aiProvider} apprentice` : 'On-device apprentice (no API key)'}
            on={isLiveAI}
            onLabel={`Live · ${aiProvider}`}
            offLabel="On-device"
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Add <code className="rounded bg-ink-500 px-1 text-slate-300">VITE_SUPABASE_URL</code> /{' '}
          <code className="rounded bg-ink-500 px-1 text-slate-300">VITE_SUPABASE_ANON_KEY</code> and{' '}
          <code className="rounded bg-ink-500 px-1 text-slate-300">VITE_AI_PROVIDER</code> to your{' '}
          <code className="rounded bg-ink-500 px-1 text-slate-300">.env</code> to switch these on. See the README.
        </p>
      </Card>

      <button
        onClick={() => {
          logout()
          navigate('/login')
        }}
        className="btn-danger w-full sm:w-auto"
      >
        <IconLogout size={18} /> Sign out
      </button>

      <p className="pt-2 text-center text-xs text-slate-600">TerrainPro Estimator · MVP build</p>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function IntegrationRow({
  name,
  desc,
  on,
  onLabel,
  offLabel,
}: {
  name: string
  desc: string
  on: boolean
  onLabel: string
  offLabel: string
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-ink-400 bg-ink-500 px-3.5 py-3">
      <div>
        <div className="text-sm font-semibold text-slate-200">{name}</div>
        <div className="text-xs text-slate-500" dangerouslySetInnerHTML={{ __html: desc }} />
      </div>
      <span className={`pill border ${on ? 'border-sage-500/30 bg-sage-500/10 text-sage-400' : 'border-amber/30 bg-amber/10 text-amber'}`}>
        {on ? onLabel : offLabel}
      </span>
    </div>
  )
}
