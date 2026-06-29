// Contractor pipeline workflow (TerrainOS):
//   Walk site → Capture scope → Detect hidden costs → Assess risk → Validate → Review
//
// Pure-engine driven: every figure comes from runPipeline(context, bi, risk).
// Stores INPUTS only; results are derived live so BusinessIntelligence stays the
// single source of truth. Inherits the existing app theme (frozen visual system).

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { runPipeline, suggestForgottenItems, canSend } from '../pipeline'
import type {
  AccessConstraint,
  QuoteContext,
  ScopeCategory,
  ScopeItem,
  SoilType,
  ValidationCheck,
} from '../pipeline/types'
import { aud, uid } from '../lib/format'
import { Progress } from '../components/ui'
import {
  IconArrow,
  IconBack,
  IconBrain,
  IconCheck,
  IconDownload,
  IconHard,
  IconWarning,
} from '../components/icons'

type StepKey = 'walk' | 'hidden' | 'risk' | 'validate' | 'preview'
const STEPS: { key: StepKey; label: string }[] = [
  { key: 'walk', label: 'Site' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'risk', label: 'Risk' },
  { key: 'validate', label: 'Validate' },
  { key: 'preview', label: 'Review' },
]

const SOIL_LABELS: Record<SoilType, string> = {
  sand: 'Sand',
  clay: 'Clay',
  'reactive-clay': 'Reactive / black soil',
  rock: 'Rock',
  fill: 'Uncontrolled fill',
  loam: 'Loam / topsoil',
  unknown: 'Not confirmed',
}
const ACCESS: { key: AccessConstraint; label: string }[] = [
  { key: 'tight', label: 'Tight access' },
  { key: 'sloped', label: 'Sloped' },
  { key: 'overhead', label: 'Overhead' },
  { key: 'restricted-hours', label: 'Restricted hrs' },
  { key: 'wet', label: 'Wet site' },
]
const MATERIAL_LABELS: Record<string, string> = {
  conc25: 'Concrete 25MPa',
  conc32: 'Concrete 32MPa',
  roadbase: 'Roadbase',
  mesh: 'Reo Mesh SL72',
  drainagegravel: 'Drainage gravel',
}
const SCOPE_CATS: { key: ScopeCategory; label: string; material?: boolean }[] = [
  { key: 'concrete', label: 'Concrete', material: true },
  { key: 'reo', label: 'Reo / mesh', material: true },
  { key: 'paving', label: 'Paving', material: true },
  { key: 'drainage', label: 'Drainage', material: true },
  { key: 'prep', label: 'Prep / base', material: true },
  { key: 'labour', label: 'Labour' },
  { key: 'other', label: 'Other' },
]

export default function SiteQuote() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const sq = useStore((s) => s.getSiteQuote(id))
  const bi = useStore((s) => s.bi)
  const updateSiteContext = useStore((s) => s.updateSiteContext)
  const updateSiteRisk = useStore((s) => s.updateSiteRisk)
  const updateSiteQuote = useStore((s) => s.updateSiteQuote)
  const [stepIdx, setStepIdx] = useState(0)

  const pipe = useMemo(() => (sq ? runPipeline(sq.context, bi, sq.risk) : null), [sq?.context, sq?.risk, bi]) // eslint-disable-line react-hooks/exhaustive-deps
  const suggestions = useMemo(
    () => (sq && pipe ? suggestForgottenItems(sq.context, pipe.quantity, bi) : []),
    [sq?.context, pipe, bi], // eslint-disable-line react-hooks/exhaustive-deps
  )

  if (!sq || !pipe) {
    return (
      <div className="py-20 text-center text-slate-400">
        Quote not found.{' '}
        <button className="text-sage-400 underline" onClick={() => navigate('/')}>
          Back to dashboard
        </button>
      </div>
    )
  }

  const step = STEPS[stepIdx]
  const isLast = stepIdx === STEPS.length - 1
  const sendable = canSend(pipe.validation)
  const marginPct = pipe.commercial.quotedTotal > 0 ? Math.round((pipe.commercial.marginTotal / pipe.commercial.quotedTotal) * 100) : 0

  const setCtx = (mut: (c: QuoteContext) => QuoteContext) => updateSiteContext(id, mut(sq.context))

  return (
    <div className="pb-32 lg:pb-24">
      {/* Sticky header + stage-aware KPI strip */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-ink-400 bg-ink-900/95 px-4 pb-2.5 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-4 lg:px-4">
        <div className="flex items-center gap-2 py-2">
          <button onClick={() => navigate('/')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-500 text-slate-300">
            <IconBack size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <input
              className="w-full truncate bg-transparent text-sm font-bold text-slate-100 outline-none placeholder:text-slate-600"
              value={sq.title}
              placeholder="Site quote"
              onChange={(e) => updateSiteQuote(id, { title: e.target.value })}
            />
            <div className="truncate text-[11px] text-slate-500">{sq.client || 'No client'} · pipeline quote</div>
          </div>
          <StatusPill status={pipe.validation.status} />
        </div>

        {step.key === 'walk' ? (
          <div className="grid grid-cols-3 gap-1.5">
            <Kpi label="Bank m³" value={String(pipe.quantity.derived.cutFillVolumes.bankM3)} />
            <Kpi label="Plant hrs" value={String(pipe.quantity.derived.plantHours.reduce((s, p) => s + p.hours, 0).toFixed(1))} />
            <Kpi label="Spoil t" value={String(pipe.quantity.derived.disposalTonnes)} />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            <Kpi label="Cost" value={aud(pipe.rate.totalCost)} />
            <Kpi label="Quoted" value={aud(pipe.commercial.quotedTotal)} tone="sage" />
            <Kpi label="Margin" value={`${marginPct}%`} />
            <Kpi label="Status" value={pipe.validation.status.toUpperCase()} tone={pipe.validation.status === 'fail' ? 'danger' : pipe.validation.status === 'warn' ? 'amber' : 'sage'} />
          </div>
        )}
      </div>

      {/* Step rail */}
      <div className="tabbar mb-4">
        {STEPS.map((s, i) => (
          <button key={s.key} onClick={() => setStepIdx(i)} className={`tab ${i === stepIdx ? 'tab-on' : 'tab-off'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {step.key === 'walk' && <WalkStep ctx={sq.context} setCtx={setCtx} />}
      {step.key === 'hidden' && <HiddenStep ctx={sq.context} setCtx={setCtx} suggestions={suggestions} />}
      {step.key === 'risk' && <RiskStep risk={sq.risk} onChange={(r) => updateSiteRisk(id, r)} policyOverhead={bi.pricingPolicy.overheadPercent} policyRisk={bi.pricingPolicy.riskContingencyDefault} />}
      {step.key === 'validate' && <ValidateStep checks={pipe.validation.checks} status={pipe.validation.status} onFix={() => setStepIdx(0)} />}
      {step.key === 'preview' && <PreviewStep id={id} />}

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-[58px] z-30 border-t border-ink-400 bg-ink-800/95 px-3 py-2.5 backdrop-blur lg:bottom-0 lg:left-60">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
              <span>Step {stepIdx + 1} of {STEPS.length}</span>
              <span>{step.label}</span>
            </div>
            <Progress value={((stepIdx + 1) / STEPS.length) * 100} />
          </div>
          {stepIdx > 0 && (
            <button onClick={() => setStepIdx((i) => i - 1)} className="btn-ghost !py-2.5 text-xs">
              Back
            </button>
          )}
          {!isLast ? (
            <button onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))} className="btn-primary !py-2.5 text-xs">
              Next <IconArrow size={16} />
            </button>
          ) : (
            <button
              onClick={() => sendable && updateSiteQuote(id, { status: 'sent' })}
              disabled={!sendable}
              className="btn-primary !py-2.5 text-xs"
              title={sendable ? 'Send quote' : 'Blocked — fix validation failures first'}
            >
              {sendable ? 'Send quote' : 'Blocked'} <IconCheck size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ───────────────── Step 1: Site Walkthrough ───────────────── */
function WalkStep({ ctx, setCtx }: { ctx: QuoteContext; setCtx: (m: (c: QuoteContext) => QuoteContext) => void }) {
  const digRows = ctx.site.areas.map((a) => ({ id: a.id, label: a.label, areaM2: a.areaM2, depthMm: ctx.site.depths.find((d) => d.id === a.id)?.depthMm ?? 0 }))

  const setDig = (rowId: string, patch: Partial<{ label: string; areaM2: number; depthMm: number }>) =>
    setCtx((c) => ({
      ...c,
      site: {
        ...c.site,
        areas: c.site.areas.map((a) => (a.id === rowId ? { ...a, label: patch.label ?? a.label, areaM2: patch.areaM2 ?? a.areaM2 } : a)),
        depths: c.site.depths.map((d) => (d.id === rowId ? { ...d, depthMm: patch.depthMm ?? d.depthMm } : d)),
      },
    }))
  const addDig = () => {
    const rid = uid('dig_')
    setCtx((c) => ({ ...c, site: { ...c.site, areas: [...c.site.areas, { id: rid, label: '', areaM2: 0 }], depths: [...c.site.depths, { id: rid, label: '', depthMm: 200 }] } }))
  }
  const removeDig = (rid: string) => setCtx((c) => ({ ...c, site: { ...c.site, areas: c.site.areas.filter((a) => a.id !== rid), depths: c.site.depths.filter((d) => d.id !== rid) } }))

  const toggleAccess = (k: AccessConstraint) =>
    setCtx((c) => {
      const has = c.site.accessConstraints.includes(k)
      return { ...c, site: { ...c.site, accessConstraints: has ? c.site.accessConstraints.filter((x) => x !== k) : [...c.site.accessConstraints, k] } }
    })

  const setScope = (sid: string, patch: Partial<ScopeItem>) => setCtx((c) => ({ ...c, scopeItems: c.scopeItems.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }))
  const addScope = () => setCtx((c) => ({ ...c, scopeItems: [...c.scopeItems, { id: uid('si_'), description: '', category: 'concrete', materialId: 'conc25', quantity: 0, unit: 'm3' }] }))
  const removeScope = (sid: string) => setCtx((c) => ({ ...c, scopeItems: c.scopeItems.filter((s) => s.id !== sid) }))

  return (
    <div className="space-y-3 animate-fade-up">
      <Intro icon={<IconHard size={18} className="text-sage-400" />} title="Walk the site" hint="Physical inputs only — no dollars here. The engine turns this into quantities." />

      {/* Ground + access */}
      <div className="card p-3.5">
        <Label>Ground</Label>
        <Select value={ctx.site.soilType} onChange={(v) => setCtx((c) => ({ ...c, site: { ...c.site, soilType: v as SoilType } }))} options={Object.entries(SOIL_LABELS)} />
        <Label className="mt-3">Access &amp; conditions</Label>
        <div className="flex flex-wrap gap-1.5">
          {ACCESS.map((a) => {
            const on = ctx.site.accessConstraints.includes(a.key)
            return (
              <button key={a.key} onClick={() => toggleAccess(a.key)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${on ? 'border-amber/50 bg-amber/10 text-amber' : 'border-ink-400 bg-ink-500 text-slate-400'}`}>
                {a.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Dig areas */}
      <div className="card p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <Label className="!mb-0">Excavation areas</Label>
          <span className="text-[11px] text-slate-500">area × depth → m³</span>
        </div>
        <div className="space-y-2">
          {digRows.map((r) => (
            <div key={r.id} className="flex items-center gap-1.5">
              <input className="input !py-2 flex-1 text-sm" placeholder="Label (e.g. Driveway)" value={r.label} onChange={(e) => setDig(r.id, { label: e.target.value })} />
              <NumBox value={r.areaM2} suffix="m²" onChange={(v) => setDig(r.id, { areaM2: v })} w="w-20" />
              <NumBox value={r.depthMm} suffix="mm" onChange={(v) => setDig(r.id, { depthMm: v })} w="w-20" />
              <button onClick={() => removeDig(r.id)} className="px-1 text-slate-600 hover:text-danger">✕</button>
            </div>
          ))}
        </div>
        <AddBtn onClick={addDig} label="Add excavation area" />
      </div>

      {/* Scope items */}
      <div className="card p-3.5">
        <Label>Materials &amp; scope</Label>
        <div className="space-y-2">
          {ctx.scopeItems.map((s) => {
            const cat = SCOPE_CATS.find((c) => c.key === s.category)
            return (
              <div key={s.id} className="rounded-lg border border-ink-400 bg-ink-700 p-2.5">
                <div className="flex items-center gap-1.5">
                  <select className="input !py-1.5 w-32 text-xs" value={s.category} onChange={(e) => setScope(s.id, { category: e.target.value as ScopeCategory })}>
                    {SCOPE_CATS.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  {cat?.material ? (
                    <select
                      className="input !py-1.5 flex-1 text-xs"
                      value={s.materialId ?? ''}
                      onChange={(e) => {
                        const mid = e.target.value
                        const m = useStore.getState().bi.rates.materialRates[mid]
                        setScope(s.id, { materialId: mid, description: MATERIAL_LABELS[mid] ?? mid, unit: m?.unit ?? s.unit })
                      }}
                    >
                      <option value="">Pick material…</option>
                      {Object.keys(useStore.getState().bi.rates.materialRates).map((mid) => (
                        <option key={mid} value={mid}>{MATERIAL_LABELS[mid] ?? mid}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="input !py-1.5 flex-1 text-xs" placeholder="Description" value={s.description} onChange={(e) => setScope(s.id, { description: e.target.value })} />
                  )}
                  <button onClick={() => removeScope(s.id)} className="px-1 text-slate-600 hover:text-danger">✕</button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <NumBox value={s.quantity ?? 0} onChange={(v) => setScope(s.id, { quantity: v })} w="w-24" />
                  <select className="input !py-1.5 w-20 text-xs" value={s.unit ?? 'ea'} onChange={(e) => setScope(s.id, { unit: e.target.value as ScopeItem['unit'] })}>
                    {['m3', 'm2', 't', 'hr', 'ea'].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  {cat?.key === 'labour' && (
                    <select className="input !py-1.5 flex-1 text-xs" value={s.roleId ?? 'labourer'} onChange={(e) => setScope(s.id, { roleId: e.target.value })}>
                      {Object.keys(useStore.getState().bi.rates.labourRates).map((rid) => (
                        <option key={rid} value={rid}>{rid}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <AddBtn onClick={addScope} label="Add scope item" />
      </div>
    </div>
  )
}

/* ───────────────── Step 2: Hidden Cost Intelligence ───────────────── */
function HiddenStep({ ctx, setCtx, suggestions }: { ctx: QuoteContext; setCtx: (m: (c: QuoteContext) => QuoteContext) => void; suggestions: ReturnType<typeof suggestForgottenItems> }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const addItem = (item: ScopeItem) => setCtx((c) => ({ ...c, scopeItems: [...c.scopeItems, { ...item, id: uid('fi_') }] }))
  const visible = suggestions.filter((s) => !dismissed.has(s.key))

  return (
    <div className="space-y-3 animate-fade-up">
      <Intro icon={<IconWarning size={18} className="text-amber" />} title="Hidden cost intelligence" hint="Things contractors forget. Accept one and it re-enters at the start of the pipeline so it flows through to price." />

      {visible.length === 0 ? (
        <div className="card flex items-center gap-3 p-4 text-sage-400">
          <IconCheck size={22} />
          <div>
            <div className="font-semibold">Nothing obvious missing.</div>
            <p className="text-sm text-slate-400">On what you've captured, the common traps are covered. Still confirm ground and access.</p>
          </div>
        </div>
      ) : (
        visible.map((s) => (
          <div key={s.key} className="card-flat border border-amber/30 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <IconWarning size={15} className="shrink-0 text-amber" />
                <h3 className="text-sm font-semibold text-slate-100">{s.title}</h3>
              </div>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-500">{s.item.quantity} {s.item.unit}</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.why}</p>
            <div className="mt-2.5 flex gap-2">
              <button onClick={() => addItem(s.item)} className="btn-primary flex-1 !py-2 text-xs">
                <IconCheck size={14} /> Add to scope
              </button>
              <button onClick={() => setDismissed((d) => new Set(d).add(s.key))} className="btn-ghost !py-2 text-xs">
                Not needed
              </button>
            </div>
          </div>
        ))
      )}

      {/* Items already added (forgotten + scope) for confidence */}
      {ctx.scopeItems.length > 0 && (
        <div className="card p-3.5">
          <Label>In the scope</Label>
          <div className="space-y-1">
            {ctx.scopeItems.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-xs">
                <span className="truncate text-slate-300">{s.description || s.category}</span>
                <span className="stat-num shrink-0 text-slate-500">{s.quantity} {s.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────────── Step 3: Risk ───────────────── */
function RiskStep({ risk, onChange, policyOverhead, policyRisk }: { risk: { riskContingencyPercent?: number; overheadPercentOverride?: number; flags?: string[] }; onChange: (r: typeof risk) => void; policyOverhead: number; policyRisk: number }) {
  const RISK_FLAGS = ['Unconfirmed ground', 'Rock likely', 'Limited access', 'Weather exposed', 'Live services', 'Tight program']
  const contingency = Math.round((risk.riskContingencyPercent ?? policyRisk) * 100)
  const overhead = Math.round((risk.overheadPercentOverride ?? policyOverhead) * 100)
  const flags = risk.flags ?? []
  return (
    <div className="space-y-3 animate-fade-up">
      <Intro icon={<IconBrain size={18} className="text-sage-400" />} title="Assess the risk" hint="Risk and overhead feed the Commercial engine. Higher risk → more contingency on top of cost." />

      <div className="card p-3.5">
        <SliderRow label="Risk contingency" value={contingency} min={0} max={30} onChange={(v) => onChange({ ...risk, riskContingencyPercent: v / 100 })} hint={`Policy default ${Math.round(policyRisk * 100)}%`} />
        <div className="mt-4" />
        <SliderRow label="Overhead" value={overhead} min={0} max={30} onChange={(v) => onChange({ ...risk, overheadPercentOverride: v / 100 })} hint={`Policy default ${Math.round(policyOverhead * 100)}%`} />
      </div>

      <div className="card p-3.5">
        <Label>Risk flags</Label>
        <div className="flex flex-wrap gap-1.5">
          {RISK_FLAGS.map((f) => {
            const on = flags.includes(f)
            return (
              <button
                key={f}
                onClick={() => onChange({ ...risk, flags: on ? flags.filter((x) => x !== f) : [...flags, f] })}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${on ? 'border-amber/50 bg-amber/10 text-amber' : 'border-ink-400 bg-ink-500 text-slate-400'}`}
              >
                {f}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Flags are recorded on the quote and remind you to price the risk — they don't auto-inflate the number.</p>
      </div>
    </div>
  )
}

/* ───────────────── Step 4: Validation Gate ───────────────── */
function ValidateStep({ checks, status, onFix }: { checks: ValidationCheck[]; status: string; onFix: () => void }) {
  const fails = checks.filter((c) => c.severity === 'fail')
  const warns = checks.filter((c) => c.severity === 'warn')
  const tone = status === 'fail' ? 'danger' : status === 'warn' ? 'amber' : 'sage'
  return (
    <div className="space-y-3 animate-fade-up">
      {/* Verdict banner */}
      <div className={`overflow-hidden rounded-2xl border bg-ink-600 ${tone === 'danger' ? 'border-danger/50' : tone === 'amber' ? 'border-amber/45' : 'border-sage-500/40'}`}>
        <div className={`h-1 w-full ${tone === 'danger' ? 'bg-danger' : tone === 'amber' ? 'bg-amber' : 'bg-sage-500'}`} />
        <div className="flex items-center gap-3 p-4">
          {status === 'fail' ? <IconWarning size={24} className="text-danger" /> : <IconCheck size={24} className="text-sage-400" />}
          <div>
            <div className="text-base font-extrabold text-slate-100">{status === 'fail' ? 'Blocked — do not send' : status === 'warn' ? 'Check before sending' : 'Good to send'}</div>
            <p className="text-xs text-slate-400">
              {status === 'fail' ? `${fails.length} failure${fails.length === 1 ? '' : 's'} must be fixed first.` : `${warns.length} item${warns.length === 1 ? '' : 's'} to review.`}
            </p>
          </div>
        </div>
      </div>

      {checks.length === 0 ? (
        <div className="card p-4 text-sm text-slate-400">No issues found. Numbers stack up.</div>
      ) : (
        <div className="space-y-2">
          {[...fails, ...warns, ...checks.filter((c) => c.severity === 'info')].map((c, i) => (
            <div key={i} className={`card-flat border p-3 ${c.severity === 'fail' ? 'border-danger/40' : c.severity === 'warn' ? 'border-amber/30' : 'border-ink-400'}`}>
              <div className="flex items-center gap-2">
                <span className={`pill border ${c.severity === 'fail' ? 'border-danger/40 bg-danger/15 text-danger' : c.severity === 'warn' ? 'border-amber/40 bg-amber/15 text-amber' : 'border-ink-300 bg-ink-400/50 text-slate-300'}`}>{c.severity}</span>
                <span className="text-xs font-semibold text-slate-300">{c.rule}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{c.message}</p>
            </div>
          ))}
        </div>
      )}

      {status !== 'pass' && (
        <button onClick={onFix} className="btn-ghost w-full text-xs">
          <IconBack size={14} /> Back to fix the inputs
        </button>
      )}
    </div>
  )
}

/* ───────────────── Step 5: Quote Preview (read-only) ───────────────── */
function PreviewStep({ id }: { id: string }) {
  const sq = useStore((s) => s.getSiteQuote(id))!
  const bi = useStore((s) => s.bi)
  const pipe = runPipeline(sq.context, bi, sq.risk)
  const c = pipe.commercial
  const marginPct = c.quotedTotal > 0 ? Math.round((c.marginTotal / c.quotedTotal) * 100) : 0
  const lineDesc = new Map(pipe.quantity.lines.map((l) => [l.id, l.description]))

  return (
    <div className="space-y-3 animate-fade-up">
      <div className="card p-4">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quote total (read-only)</div>
        <div className="stat-num text-3xl font-extrabold text-sage-400">{aud(c.quotedTotal)}</div>
        <div className="mt-1 text-xs text-slate-500">Cost {aud(pipe.rate.totalCost)} · margin {marginPct}% · {canSend(pipe.validation) ? 'cleared to send' : 'blocked by validation'}</div>
      </div>

      <div className="card-flat overflow-hidden">
        <div className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Priced lines</div>
        <div className="divide-y divide-ink-400">
          {c.pricedLines.map((p) => (
            <div key={p.lineId} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
              <span className="min-w-0 truncate text-slate-300">{lineDesc.get(p.lineId) ?? p.lineId}</span>
              <span className="stat-num shrink-0 text-slate-200">{aud(p.sell)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-3.5">
        <Row label="Build cost" value={aud(pipe.rate.totalCost)} />
        <Row label="Overhead" value={aud(c.overhead)} />
        <Row label="Risk contingency" value={aud(c.riskContingency)} tone="text-amber" />
        <Row label="Margin" value={aud(c.marginTotal)} tone="text-sage-400" />
        <div className="my-1.5 border-t border-ink-400" />
        <Row label="Quoted total" value={aud(c.quotedTotal)} big />
      </div>

      <button className="btn-ghost w-full text-xs" disabled title="PDF export uses the existing document engine">
        <IconDownload size={14} /> Export (uses existing quote document)
      </button>
    </div>
  )
}

/* ───────────────── shared bits ───────────────── */
function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'sage' | 'amber' | 'danger' }) {
  const color = tone === 'sage' ? 'text-sage-400' : tone === 'amber' ? 'text-amber' : tone === 'danger' ? 'text-danger' : 'text-slate-100'
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value text-sm ${color}`}>{value}</div>
    </div>
  )
}
function StatusPill({ status }: { status: string }) {
  const cls = status === 'fail' ? 'border-danger/40 bg-danger/15 text-danger' : status === 'warn' ? 'border-amber/40 bg-amber/15 text-amber' : 'border-sage-500/30 bg-sage-500/10 text-sage-400'
  return <span className={`pill border ${cls}`}>{status}</span>
}
function Intro({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5 px-1">
      {icon}
      <div>
        <h2 className="text-sm font-bold text-slate-100">{title}</h2>
        <p className="text-[11px] leading-relaxed text-slate-500">{hint}</p>
      </div>
    </div>
  )
}
function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <label className={`mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 ${className}`}>{children}</label>
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select className="input !py-2 appearance-none text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  )
}
function NumBox({ value, onChange, suffix, w = 'w-full' }: { value: number; onChange: (v: number) => void; suffix?: string; w?: string }) {
  return (
    <div className={`flex items-center rounded-lg border border-ink-400 bg-ink-500 px-2 ${w} focus-within:border-sage-500`}>
      <input type="number" className="w-full bg-transparent py-1.5 text-sm font-mono tabular-nums text-slate-100 outline-none" value={value || ''} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
      {suffix && <span className="text-[10px] text-slate-500">{suffix}</span>}
    </div>
  )
}
function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-300 bg-ink-700/60 py-2.5 text-xs font-semibold text-slate-400 hover:border-sage-500 hover:text-sage-400">
      + {label}
    </button>
  )
}
function SliderRow({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="stat-num font-bold text-sage-400">{value}%</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="w-full accent-sage-500" />
      <div className="mt-0.5 text-[10px] text-slate-600">{hint}</div>
    </div>
  )
}
function Row({ label, value, tone, big }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={big ? 'text-sm font-bold text-slate-100' : 'text-xs text-slate-400'}>{label}</span>
      <span className={`stat-num ${big ? 'text-lg font-extrabold text-sage-400' : tone || 'text-slate-200'}`}>{value}</span>
    </div>
  )
}
