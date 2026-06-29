// Small reusable presentational components shared across screens.

import type { ReactNode } from 'react'
import type { HiddenCostSeverity } from '../engine/types'
import { aud } from '../lib/format'

export function Logo({ size = 28, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
        <rect width="64" height="64" rx="14" fill="#0A0D0F" stroke="#28323B" />
        <path d="M14 44 L32 14 L50 44 Z" fill="none" stroke="#6FA86F" strokeWidth="4" strokeLinejoin="round" />
        <path d="M22 44 L32 28 L42 44 Z" fill="#6FA86F" />
      </svg>
      {withWordmark && (
        <div className="leading-none">
          <div className="text-[15px] font-extrabold tracking-tight text-slate-100">
            Terrain<span className="text-sage-500">Pro</span>
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Estimator</div>
        </div>
      )}
    </div>
  )
}

const sevStyles: Record<HiddenCostSeverity, string> = {
  critical: 'bg-danger/15 text-danger border-danger/30',
  high: 'bg-amber/15 text-amber border-amber/30',
  medium: 'bg-info/15 text-info border-info/30',
  low: 'bg-ink-400/60 text-slate-300 border-ink-300',
}

export function SeverityBadge({ severity }: { severity: HiddenCostSeverity }) {
  return <span className={`pill border ${sevStyles[severity]}`}>{severity}</span>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 sm:p-5 ${className}`}>{children}</div>
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">{children}</h2>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  )
}

export function StatTile({
  label,
  value,
  sub,
  accent = 'default',
}: {
  label: string
  value: string
  sub?: string
  accent?: 'default' | 'sage' | 'amber' | 'danger'
}) {
  const tone =
    accent === 'sage'
      ? 'text-sage-400'
      : accent === 'amber'
        ? 'text-amber'
        : accent === 'danger'
          ? 'text-danger'
          : 'text-slate-100'
  return (
    <div className="card-flat p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold stat-num ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

/** The low / expected / high price band visual. */
export function EstimateBand({ low, expected, high }: { low: number; expected: number; high: number }) {
  const span = Math.max(high - low, 1)
  const pos = ((expected - low) / span) * 100
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <Band label="Low" value={low} tone="text-slate-400" />
        <Band label="Expected" value={expected} tone="text-sage-400" big />
        <Band label="High" value={high} tone="text-amber" align="right" />
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-ink-400 via-sage-700/50 to-amber/40">
        <div
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-ink-900 bg-sage-500 shadow-glow"
          style={{ left: `calc(${pos}% - 8px)` }}
        />
      </div>
    </div>
  )
}

function Band({
  label,
  value,
  tone,
  big = false,
  align = 'left',
}: {
  label: string
  value: number
  tone: string
  big?: boolean
  align?: 'left' | 'right'
}) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`stat-num font-bold ${tone} ${big ? 'text-2xl sm:text-3xl' : 'text-base'}`}>{aud(value)}</div>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-400 bg-ink-700/50 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-slate-600">{icon}</div>}
      <div className="font-semibold text-slate-300">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
    </div>
  )
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-400">
      <div
        className="h-full rounded-full bg-sage-500 transition-all"
        style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
      />
    </div>
  )
}
