// Contractor pipeline workflow — now driven by the authoritative estimating
// engine (src/estimator). Captures the RawInput answers and runs
// estimate(rawInput, bi) live; renders the engine's Quote (quantities, hidden
// costs, risk, validation gate, client quote + internal sheet).
// Visual system unchanged — inherits existing classes.

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { estimate, isStructural } from '../estimator'
import { aud } from '../lib/format'
import { Progress } from '../components/ui'
import { IconArrow, IconBack, IconBrain, IconCheck, IconHard, IconWarning } from '../components/icons'

type EQuote = ReturnType<typeof estimate>
type StepKey = 'site' | 'hidden' | 'risk' | 'validate' | 'review'
const STEPS: { key: StepKey; label: string }[] = [
  { key: 'site', label: 'Site' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'risk', label: 'Risk' },
  { key: 'validate', label: 'Validate' },
  { key: 'review', label: 'Review' },
]

// Earthworks types use the cut/spoil walkthrough; structural concreting types
// use the engineered-element walkthrough (reo by tonnage, formwork, certified).
const EARTHWORKS_JOBS = ['pad_prep', 'site_cut', 'bulk_excavation', 'trenching', 'final_trim', 'spoil_removal']
const STRUCTURAL_JOBS = ['suspended_slab', 'columns', 'beams', 'structural_wall']
const JOB_TYPES = [...EARTHWORKS_JOBS, ...STRUCTURAL_JOBS]
const MATERIALS = ['clay', 'common_earth', 'sand', 'gravel', 'topsoil', 'rock', 'fill']
const ACCESS = ['open', 'chute', 'barrow', 'pump', 'restricted']
const FINISHES = ['trowel', 'broom', 'float']
const REINFORCEMENT = ['engineered', 'none']
const QUOTE_TYPES = ['Fixed', 'Estimate', 'Indicative']

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : 0)
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const bool = (v: unknown): boolean => v === true

export default function SiteQuote() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const sq = useStore((s) => s.getSiteQuote(id))
  const bi = useStore((s) => s.bi)
  const setAnswers = useStore((s) => s.updateSiteAnswers)
  const updateSiteQuote = useStore((s) => s.updateSiteQuote)
  const [stepIdx, setStepIdx] = useState(0)

  const q = useMemo<EQuote | null>(() => (sq ? estimate(sq.rawInput, bi) : null), [sq?.rawInput, bi]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sq || !q) {
    return (
      <div className="py-20 text-center text-slate-400">
        Quote not found.{' '}
        <button className="text-sage-400 underline" onClick={() => navigate('/')}>
          Back to dashboard
        </button>
      </div>
    )
  }

  const a = sq.rawInput.answers
  const set = (patch: Record<string, unknown>) => setAnswers(id, patch)
  const step = STEPS[stepIdx]
  const isLast = stepIdx === STEPS.length - 1
  const v = q.validation
  const sheet = q.internalSheet
  const sendable = q.clientQuote?.sendable ?? false
  const marginPct = sheet ? Math.round(sheet.realisedMargin * 100) : 0

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
            <div className="truncate text-[11px] text-slate-500">{sq.client || 'No client'} · {bi.region} rates</div>
          </div>
          <StatusPill status={v?.status ?? 'PASS'} />
        </div>

        {step.key === 'site' ? (
          isStructural(q.jobType) ? (
            <div className="grid grid-cols-3 gap-1.5">
              <Kpi label="Concrete m³" value={String(q.quantities.concreteVolumeM3 ?? 0)} />
              <Kpi label="Reo t" value={String(q.quantities.reoTonnes ?? 0)} />
              <Kpi label="Formwork m²" value={String(q.quantities.formworkM2 ?? 0)} />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              <Kpi label="Bank m³" value={String(q.quantities.cutVolumeBankM3 ?? 0)} />
              <Kpi label="Machine hrs" value={String(q.quantities.machineHours ?? 0)} />
              <Kpi label="Loads" value={String(q.quantities.truckLoads ?? 0)} />
            </div>
          )
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            <Kpi label="Cost" value={aud(sheet?.costTotal ?? 0)} />
            <Kpi label="Sell" value={aud(sheet?.sellTotal ?? 0)} tone="sage" />
            <Kpi label="Margin" value={`${marginPct}%`} />
            <Kpi label="Status" value={v?.status ?? '—'} tone={v?.status === 'BLOCK' ? 'danger' : v?.status === 'WARN' ? 'amber' : 'sage'} />
          </div>
        )}
      </div>

      <div className="tabbar mb-4">
        {STEPS.map((s, i) => (
          <button key={s.key} onClick={() => setStepIdx(i)} className={`tab ${i === stepIdx ? 'tab-on' : 'tab-off'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {step.key === 'site' && <SiteStep a={a} set={set} q={q} />}
      {step.key === 'hidden' && <HiddenStep q={q} />}
      {step.key === 'risk' && <RiskStep a={a} set={set} q={q} />}
      {step.key === 'validate' && <ValidateStep q={q} onFix={() => setStepIdx(0)} />}
      {step.key === 'review' && <ReviewStep q={q} />}

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
              title={sendable ? 'Send quote' : 'Blocked by validation — fix before sending'}
            >
              {sendable ? 'Send quote' : 'Blocked'} <IconCheck size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ───────────── Step 1: Site walkthrough (RawInput answers) ───────────── */
function SiteStep({ a, set, q }: { a: Record<string, unknown>; set: (p: Record<string, unknown>) => void; q: EQuote }) {
  const jobType = str(a.jobType, 'pad_prep')
  const isTrench = jobType === 'trenching'
  const isSpoilOnly = jobType === 'spoil_removal'
  const isStruct = isStructural(jobType)

  // Switching to a structural element seeds the inputs the engine needs to
  // produce reo & formwork immediately (engineered reo, pumped placement).
  const onJobType = (val: string) => {
    const patch: Record<string, unknown> = { jobType: val }
    if (isStructural(val)) {
      if (a.reinforcement == null) patch.reinforcement = 'engineered'
      if (a.access == null) patch.access = 'pump'
    }
    set(patch)
  }

  if (isStruct) return <StructuralStep a={a} set={set} q={q} jobType={jobType} onJobType={onJobType} />

  return (
    <div className="space-y-3 animate-fade-up">
      <Intro icon={<IconHard size={18} className="text-sage-400" />} title="Walk the site" hint="Physical facts only — the engine turns these into quantities (no dollars here)." />

      <div className="card p-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Job type"><Select value={jobType} onChange={onJobType} options={JOB_TYPES} /></Field>
          <Field label="Ground"><Select value={str(a.material, 'common_earth')} onChange={(val) => set({ material: val })} options={MATERIALS} /></Field>

          {isSpoilOnly ? (
            <Field label="Spoil (loose m³)"><NumBox value={num(a.spoilLooseM3)} onChange={(n) => set({ spoilLooseM3: n })} /></Field>
          ) : isTrench ? (
            <>
              <Field label="Length (m)"><NumBox value={num(a.lengthM)} onChange={(n) => set({ lengthM: n })} /></Field>
              <Field label="Width (mm)"><NumBox value={num(a.widthMm)} onChange={(n) => set({ widthMm: n })} /></Field>
              <Field label="Depth (mm)"><NumBox value={num(a.depthMm)} onChange={(n) => set({ depthMm: n })} /></Field>
            </>
          ) : (
            <>
              <Field label="Area (m²)"><NumBox value={num(a.areaM2)} onChange={(n) => set({ areaM2: n })} /></Field>
              <Field label="Cut depth (mm)"><NumBox value={num(a.cutDepthMm)} onChange={(n) => set({ cutDepthMm: n })} /></Field>
              <Field label="Access"><Select value={str(a.access, 'open')} onChange={(val) => set({ access: val })} options={ACCESS} /></Field>
            </>
          )}
        </div>

        {!isSpoilOnly && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Toggle on={a.cartageRequired !== false} onClick={() => set({ cartageRequired: a.cartageRequired === false })} label="Cart spoil off" />
            <Toggle on={bool(a.importRoadbase)} onClick={() => set({ importRoadbase: !bool(a.importRoadbase) })} label="Import roadbase" />
          </div>
        )}
        {bool(a.importRoadbase) && (
          <div className="mt-2.5 w-40">
            <Field label="Roadbase depth (mm)"><NumBox value={num(a.roadbaseDepthMm)} onChange={(n) => set({ roadbaseDepthMm: n })} /></Field>
          </div>
        )}
      </div>

      <div className="card-flat p-3 text-xs text-slate-400">
        Bank {q.quantities.cutVolumeBankM3 ?? 0}m³ → loose {q.quantities.spoilLooseM3 ?? 0}m³ → {q.quantities.truckLoads ?? 0} loads · dig {q.quantities.machineHours ?? 0}h
        {q.quantities.roadbaseTonnes ? ` · import ${q.quantities.roadbaseTonnes}t roadbase` : ''}
      </div>
    </div>
  )
}

/* ───────────── Step 1 (structural concreting) ───────────── */
function StructuralStep({ a, set, q, jobType, onJobType }: { a: Record<string, unknown>; set: (p: Record<string, unknown>) => void; q: EQuote; jobType: string; onJobType: (v: string) => void }) {
  const Q = q.quantities
  return (
    <div className="space-y-3 animate-fade-up">
      <Intro icon={<IconHard size={18} className="text-sage-400" />} title="Structural element" hint="Engineered concrete — the engine sizes concrete, reo (by tonnage) and formwork. Always boom-pumped & certified." />

      <div className="card p-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Job type"><Select value={jobType} onChange={onJobType} options={JOB_TYPES} /></Field>
          <Field label="Access"><Select value={str(a.access, 'pump')} onChange={(val) => set({ access: val })} options={ACCESS} /></Field>

          {jobType === 'suspended_slab' && (
            <>
              <Field label="Area (m²)"><NumBox value={num(a.areaM2)} onChange={(n) => set({ areaM2: n })} /></Field>
              <Field label="Thickness (mm)"><NumBox value={num(a.thicknessMm)} onChange={(n) => set({ thicknessMm: n })} /></Field>
              <Field label="Prop height (m)"><NumBox value={num(a.propHeightM)} onChange={(n) => set({ propHeightM: n })} /></Field>
              <Field label="Finish"><Select value={str(a.finish, 'trowel')} onChange={(val) => set({ finish: val })} options={FINISHES} /></Field>
            </>
          )}
          {jobType === 'columns' && (
            <>
              <Field label="Columns (count)"><NumBox value={num(a.columnCount)} onChange={(n) => set({ columnCount: n })} /></Field>
              <Field label="Height (m)"><NumBox value={num(a.columnHeightM)} onChange={(n) => set({ columnHeightM: n })} /></Field>
              <Field label="Width (mm)"><NumBox value={num(a.columnWidthMm)} onChange={(n) => set({ columnWidthMm: n })} /></Field>
              <Field label="Depth (mm)"><NumBox value={num(a.columnDepthMm)} onChange={(n) => set({ columnDepthMm: n })} /></Field>
            </>
          )}
          {jobType === 'beams' && (
            <>
              <Field label="Length (m)"><NumBox value={num(a.beamLengthM)} onChange={(n) => set({ beamLengthM: n })} /></Field>
              <Field label="Width (mm)"><NumBox value={num(a.beamWidthMm)} onChange={(n) => set({ beamWidthMm: n })} /></Field>
              <Field label="Depth (mm)"><NumBox value={num(a.beamDepthMm)} onChange={(n) => set({ beamDepthMm: n })} /></Field>
            </>
          )}
          {jobType === 'structural_wall' && (
            <>
              <Field label="Length (m)"><NumBox value={num(a.wallLengthM)} onChange={(n) => set({ wallLengthM: n })} /></Field>
              <Field label="Height (m)"><NumBox value={num(a.wallHeightM)} onChange={(n) => set({ wallHeightM: n })} /></Field>
              <Field label="Thickness (mm)"><NumBox value={num(a.wallThicknessMm)} onChange={(n) => set({ wallThicknessMm: n })} /></Field>
            </>
          )}

          <Field label="Reinforcement"><Select value={str(a.reinforcement, 'engineered')} onChange={(val) => set({ reinforcement: val })} options={REINFORCEMENT} /></Field>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Toggle on={bool(a.engineerDetails)} onClick={() => set({ engineerDetails: !bool(a.engineerDetails) })} label="Engineer details known" />
          <Toggle on={a.reoInspection !== false} onClick={() => set({ reoInspection: a.reoInspection === false })} label="Reo inspection required" />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Boom pump, engineering certification & curing are added automatically for structural pours.</p>
      </div>

      <div className="card-flat p-3 text-xs text-slate-400">
        {Q.concreteVolumeM3 ?? 0}m³ {str(a.reinforcement, 'engineered') === 'none' ? '(unreinforced)' : `· ${Q.reoTonnes ?? 0}t reo`} · {Q.formworkM2 ?? 0}m² formwork · fix {Q.steelFixHours ?? 0}h · place {Q.placeFinishHours ?? 0}h
      </div>
    </div>
  )
}

/* ───────────── Step 2: Hidden costs (auto-detected) ───────────── */
function HiddenStep({ q }: { q: EQuote }) {
  return (
    <div className="space-y-3 animate-fade-up">
      <Intro icon={<IconWarning size={18} className="text-amber" />} title="Hidden cost intelligence" hint="Items contractors forget — auto-detected and priced through the Rate engine, with the rule that triggered each." />
      {q.hiddenCosts.length === 0 ? (
        <div className="card flex items-center gap-3 p-4 text-sage-400"><IconCheck size={20} /> Nothing flagged on this scope.</div>
      ) : (
        q.hiddenCosts.map((h, i) => {
          const line = q.rated?.lines.find((l) => l.item === h.item)
          return (
            <div key={i} className="card-flat border border-amber/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-100">{h.item}</span>
                {line && <span className="stat-num text-xs text-amber">{aud(line.charge)}</span>}
              </div>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{h.trigger}</p>
            </div>
          )
        })
      )}
    </div>
  )
}

/* ───────────── Step 3: Risk ───────────── */
function RiskStep({ a, set, q }: { a: Record<string, unknown>; set: (p: Record<string, unknown>) => void; q: EQuote }) {
  return (
    <div className="space-y-3 animate-fade-up">
      <Intro icon={<IconBrain size={18} className="text-sage-400" />} title="Assess the risk" hint="Confidence drives contingency and whether a fixed price is allowed. Confirm what you actually know." />
      <div className="grid grid-cols-3 gap-1.5">
        <Kpi label="Confidence" value={`${Math.round((q.confidence ?? 0) * 100)}%`} tone={(q.confidence ?? 0) < 0.6 ? 'amber' : 'sage'} />
        <Kpi label="Tier" value={(q.confidenceTier ?? '—').toUpperCase()} />
        <Kpi label="Contingency" value={`${Math.round((q.contingencyPct ?? 0) * 100)}%`} />
      </div>

      <div className="card p-3.5">
        <Field label="Quote type"><Select value={str(a.requestedQuoteType, 'Fixed')} onChange={(val) => set({ requestedQuoteType: val })} options={QUOTE_TYPES} /></Field>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Toggle on={bool(a.siteVisit)} onClick={() => set({ siteVisit: !bool(a.siteVisit) })} label="Site visit done" />
          <Toggle on={bool(a.groundConfirmed)} onClick={() => set({ groundConfirmed: !bool(a.groundConfirmed) })} label="Ground confirmed" />
          <Toggle on={bool(a.servicesLocated)} onClick={() => set({ servicesLocated: !bool(a.servicesLocated) })} label="Services located" />
        </div>
      </div>

      {q.riskFlags.length > 0 && (
        <div className="card-flat p-3.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Risk flags</div>
          <ul className="space-y-1 text-sm text-slate-300">
            {q.riskFlags.map((f, i) => <li key={i} className="flex gap-2"><span className="text-amber">•</span>{f}</li>)}
          </ul>
        </div>
      )}
      {q.assumptions.length > 0 && (
        <div className="card-flat p-3.5">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Assumptions on the quote</div>
          <ul className="space-y-1 text-xs text-slate-400">
            {q.assumptions.map((s, i) => <li key={i}>• {s}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ───────────── Step 4: Validation gate ───────────── */
function ValidateStep({ q, onFix }: { q: EQuote; onFix: () => void }) {
  const v = q.validation!
  const tone = v.status === 'BLOCK' ? 'danger' : v.status === 'WARN' ? 'amber' : 'sage'
  return (
    <div className="space-y-3 animate-fade-up">
      <div className={`overflow-hidden rounded-2xl border bg-ink-600 ${tone === 'danger' ? 'border-danger/50' : tone === 'amber' ? 'border-amber/45' : 'border-sage-500/40'}`}>
        <div className={`h-1 w-full ${tone === 'danger' ? 'bg-danger' : tone === 'amber' ? 'bg-amber' : 'bg-sage-500'}`} />
        <div className="flex items-center gap-3 p-4">
          {v.status === 'BLOCK' ? <IconWarning size={24} className="text-danger" /> : <IconCheck size={24} className="text-sage-400" />}
          <div>
            <div className="text-base font-extrabold text-slate-100">{v.status === 'BLOCK' ? 'Blocked — do not send' : v.status === 'WARN' ? 'Check before sending' : 'Good to send'}</div>
            <p className="text-xs text-slate-400">{v.recommendation}</p>
          </div>
        </div>
      </div>

      {v.findings.length === 0 ? (
        <div className="card p-4 text-sm text-slate-400">No issues found.</div>
      ) : (
        <div className="space-y-2">
          {v.findings.map((f, i) => (
            <div key={i} className={`card-flat border p-3 ${f.severity === 'block' ? 'border-danger/40' : f.severity === 'warn' ? 'border-amber/30' : 'border-ink-400'}`}>
              <div className="flex items-center gap-2">
                <span className={`pill border ${f.severity === 'block' ? 'border-danger/40 bg-danger/15 text-danger' : f.severity === 'warn' ? 'border-amber/40 bg-amber/15 text-amber' : 'border-ink-300 bg-ink-400/50 text-slate-300'}`}>{f.severity}</span>
                <span className="text-xs font-semibold text-slate-300">{f.check}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{f.detail}</p>
            </div>
          ))}
        </div>
      )}
      {v.status !== 'PASS' && (
        <button onClick={onFix} className="btn-ghost w-full text-xs"><IconBack size={14} /> Back to fix the inputs</button>
      )}
    </div>
  )
}

/* ───────────── Step 5: Review (client quote + internal sheet) ───────────── */
function ReviewStep({ q }: { q: EQuote }) {
  const cq = q.clientQuote!
  const s = q.internalSheet!
  return (
    <div className="space-y-3 animate-fade-up">
      <div className="card p-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Client quote · {cq.quoteType}</span>
          <span className={`pill border ${cq.sendable ? 'border-sage-500/30 bg-sage-500/10 text-sage-400' : 'border-amber/40 bg-amber/15 text-amber'}`}>{cq.sendable ? 'sendable' : 'indicative'}</span>
        </div>
        {cq.price != null ? (
          <div className="stat-num text-3xl font-extrabold text-sage-400">{aud(cq.price)}</div>
        ) : (
          <p className="text-sm leading-relaxed text-amber">{cq.priceText}</p>
        )}
        {cq.assumptions.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500">{cq.assumptions.map((x, i) => <li key={i}>• {x}</li>)}</ul>
        )}
      </div>

      <div className="card-flat overflow-hidden">
        <div className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Internal sheet</div>
        <div className="divide-y divide-ink-400">
          {s.lines.map((l, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
              <span className="min-w-0 truncate text-slate-300">{l.item} <span className="text-[11px] text-slate-600">· {l.qty}{l.unit}</span></span>
              <span className="stat-num shrink-0 text-slate-200">{aud(l.charge)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-3.5">
        <Row label="Cost" value={aud(s.costTotal)} />
        <Row label="Contingency" value={aud(s.contingencyAmount)} tone="text-amber" />
        <Row label="Margin" value={`${Math.round(s.realisedMargin * 100)}%`} tone="text-sage-400" />
        <Row label="GST" value={aud(s.gst)} />
        <div className="my-1.5 border-t border-ink-400" />
        <Row label="Total inc GST" value={aud(s.totalIncGst)} big />
      </div>
    </div>
  )
}

/* ───────────── shared bits ───────────── */
function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'sage' | 'amber' | 'danger' }) {
  const c = tone === 'sage' ? 'text-sage-400' : tone === 'amber' ? 'text-amber' : tone === 'danger' ? 'text-danger' : 'text-slate-100'
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value text-sm ${c}`}>{value}</div>
    </div>
  )
}
function StatusPill({ status }: { status: string }) {
  const cls = status === 'BLOCK' ? 'border-danger/40 bg-danger/15 text-danger' : status === 'WARN' ? 'border-amber/40 bg-amber/15 text-amber' : 'border-sage-500/30 bg-sage-500/10 text-sage-400'
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
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      {children}
    </div>
  )
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select className="input !py-2 appearance-none text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
    </select>
  )
}
function NumBox({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center rounded-xl border border-ink-400 bg-ink-500 px-2.5 focus-within:border-sage-500">
      <input type="number" className="w-full bg-transparent py-2 text-sm font-mono tabular-nums text-slate-100 outline-none" value={value || ''} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  )
}
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${on ? 'border-sage-500 bg-sage-500/15 text-sage-400' : 'border-ink-400 bg-ink-500 text-slate-400'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-sage-500' : 'bg-ink-300'}`} /> {label}
    </button>
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
