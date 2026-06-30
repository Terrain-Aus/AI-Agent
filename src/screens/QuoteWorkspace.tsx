// Unified, mobile-first quote workspace. Replaces the separate Chat / Details /
// Hidden-Costs / Preview pages with one screen: a sticky KPI header, tabbed
// content (progressive disclosure), a sticky action bar, and the Apprentice
// as a slide-up drawer. Built to stay usable on a phone on site.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { estimate } from '../engine/estimator'
import { riskSummary } from '../engine/hiddenCosts'
import { commercialReview, VERDICT_LABEL, type Verdict } from '../engine/review'
import { foremanReview } from '../engine/foreman'
import { JOB_TYPE_LABELS, FINISH_LABELS, SOIL_LABELS, LOCATIONS } from '../engine/pricing'
import { TRADE_LABELS } from '../engine/apprentice'
import { aud, pct } from '../lib/format'
import { downloadDocument } from '../lib/pdf'
import { EstimateBand } from '../components/ui'
import {
  IconArrow,
  IconBack,
  IconBrain,
  IconCheck,
  IconDoc,
  IconDownload,
  IconWarning,
} from '../components/icons'
import ApprenticeDrawer from '../components/ApprenticeDrawer'
import JobDebriefSheet from '../components/JobDebriefSheet'
import ForemanPanel from '../components/ForemanPanel'
import type { Access, CostCategory, Finish, HiddenCost, JobType, SoilType, Trade } from '../engine/types'

type Tab = 'summary' | 'breakdown' | 'risks' | 'details'

export default function QuoteWorkspace({ initialTab = 'summary', openChat = false }: { initialTab?: Tab; openChat?: boolean }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const quote = useStore((s) => s.getQuote(id))
  const [tab, setTab] = useState<Tab>(initialTab)
  const [chatOpen, setChatOpen] = useState(openChat)

  // Auto-open the apprentice if the quote isn't priced yet.
  useEffect(() => {
    if (quote && !quote.estimate) setChatOpen(true)
  }, [quote?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!quote) {
    return (
      <div className="py-20 text-center text-slate-400">
        Quote not found.{' '}
        <button className="text-sage-400 underline" onClick={() => navigate('/new')}>
          Start a new one
        </button>
      </div>
    )
  }

  const est = quote.estimate
  const risk = est ? riskSummary(est.hiddenCosts) : null
  // $ that drops out of profit if the excluded risks land — the headline number.
  const profitAtRisk = est ? est.hiddenCosts.filter((h) => !h.included).reduce((s, h) => s + h.estImpact, 0) : 0

  const TABS: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'breakdown', label: 'Costs' },
    { key: 'risks', label: `Risks${risk?.count ? ` (${risk.count})` : ''}` },
    { key: 'details', label: 'Job' },
  ]

  return (
    <div className="pb-32 lg:pb-24">
      {/* Sticky compact header + KPI strip (above the fold) */}
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-ink-400 bg-ink-900/95 px-4 pb-2.5 pt-1 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-4 lg:px-4">
        <div className="flex items-center gap-2 py-2">
          <button onClick={() => navigate('/')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-500 text-slate-300">
            <IconBack size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-slate-100">{quote.title}</div>
            <div className="truncate text-[11px] text-slate-500">
              {quote.client || 'No client'} · {JOB_TYPE_LABELS[quote.spec.jobType]}
            </div>
          </div>
          <span className={`pill border ${statusTone(quote.status)}`}>{quote.status}</span>
        </div>

        {/* Profit-first KPI strip — the six numbers that decide the job */}
        <div className="grid grid-cols-3 gap-1.5">
          <Kpi label="Quote Total" value={est ? aud(est.expected) : '—'} tone="sage" />
          <Kpi label="Margin" value={est ? `${est.marginPct}%` : '—'} />
          <Kpi label="Confidence" value={est ? `${est.confidence}%` : '—'} tone={est && est.confidence < 60 ? 'amber' : undefined} />
          <Kpi label="Risk" value={risk ? risk.level : '—'} tone={risk?.tone} />
          <Kpi label="Hidden Costs" value={est ? String(est.hiddenCosts.length) : '—'} tone={est && est.hiddenCosts.length ? 'amber' : undefined} />
          <Kpi label="Profit at Risk" value={est ? aud(profitAtRisk) : '—'} tone={profitAtRisk > 0 ? 'danger' : 'sage'} />
        </div>
      </div>

      {/* Tabs */}
      <div className="tabbar mb-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`tab ${tab === t.key ? 'tab-on' : 'tab-off'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {!est && tab !== 'details' ? (
        <NotPriced onAsk={() => setChatOpen(true)} />
      ) : (
        <>
          {tab === 'summary' && est && <SummaryTab id={id} onRisks={() => setTab('risks')} />}
          {tab === 'breakdown' && est && <BreakdownTab id={id} />}
          {tab === 'risks' && est && <RisksTab id={id} />}
          {tab === 'details' && <DetailsTab id={id} onRepriced={() => setTab('summary')} />}
        </>
      )}

      {/* Sticky action bar — sits above the mobile bottom nav, flush on desktop */}
      <div className="fixed inset-x-0 bottom-[58px] z-30 border-t border-ink-400 bg-ink-800/95 px-3 py-2.5 backdrop-blur lg:bottom-0 lg:left-60">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <button onClick={() => navigate('/quotes')} className="btn-ghost flex-1 !py-2.5 text-xs">
            <IconCheck size={16} /> Save
          </button>
          <button onClick={() => setChatOpen(true)} className="btn-ghost flex-[1.4] !py-2.5 text-xs">
            <IconBrain size={16} /> Ask Apprentice
          </button>
          <button
            onClick={() => (est ? setTab('summary') : setChatOpen(true))}
            className="btn-primary flex-[1.4] !py-2.5 text-xs"
          >
            <IconDownload size={16} /> {est ? 'Preview' : 'Price it'}
          </button>
        </div>
      </div>

      <ApprenticeDrawer id={id} open={chatOpen} onClose={() => setChatOpen(false)} onEstimated={() => setTab('summary')} />
    </div>
  )
}

/* ---------------- KPI ---------------- */
function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'sage' | 'amber' | 'danger' | 'info' }) {
  const color =
    tone === 'sage' ? 'text-sage-400' : tone === 'amber' ? 'text-amber' : tone === 'danger' ? 'text-danger' : tone === 'info' ? 'text-info' : 'text-slate-100'
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value text-base ${color}`}>{value}</div>
    </div>
  )
}

function NotPriced({ onAsk }: { onAsk: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-500/15 text-sage-400">
        <IconBrain size={24} />
      </div>
      <div>
        <div className="font-semibold text-slate-100">Not priced yet</div>
        <p className="mt-1 text-sm text-slate-400">Answer a few quick questions and the apprentice will crunch the numbers.</p>
      </div>
      <button onClick={onAsk} className="btn-primary">
        <IconBrain size={18} /> Ask the Apprentice
      </button>
    </div>
  )
}

/* ---------------- Summary tab ---------------- */
function SummaryTab({ id, onRisks }: { id: string; onRisks: () => void }) {
  const quote = useStore((s) => s.getQuote(id))!
  const profile = useStore((s) => s.profile)
  const businessConfigured = useStore((s) => s.business.configured)
  const [showSummary, setShowSummary] = useState(false)
  const [debrief, setDebrief] = useState(false)
  const est = quote.estimate!
  const review = commercialReview(quote.spec, est)
  // Foreman's pre-export review — the last set of eyes before the quote leaves.
  const foreman = foremanReview(quote, { businessConfigured })

  return (
    <div className="space-y-3 animate-fade-up">
      {/* Signature moment — the apprentice's commercial review */}
      <CommercialReviewCard id={id} onRisks={onRisks} />

      {/* Estimate range — secondary to the verdict */}
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estimate range</span>
          <span className="pill border border-sage-500/30 bg-sage-500/10 text-sage-400">{pct(review.metrics.confidence)} confidence</span>
        </div>
        <EstimateBand low={est.low} expected={est.expected} high={est.high} />
      </div>

      {/* Compact mini-stats */}
      <div className="grid grid-cols-3 gap-1.5">
        <MiniStat label="You keep" value={aud(est.marginAmount)} tone="sage" />
        <MiniStat label="Per m²" value={quote.spec.area ? aud(est.expected / quote.spec.area) : '—'} />
        <MiniStat label="Cost" value={aud(est.baseCost)} />
      </div>

      {/* Apprentice summary — collapsed by default to save space */}
      <div className="card-flat overflow-hidden">
        <button onClick={() => setShowSummary((v) => !v)} className="flex w-full items-center justify-between px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sage-500/90">
            <IconBrain size={14} /> Apprentice's read
          </span>
          <span className={`text-slate-500 transition ${showSummary ? 'rotate-90' : ''}`}>›</span>
        </button>
        {showSummary && <p className="border-t border-ink-400 px-3.5 py-3 text-sm leading-relaxed text-slate-300 animate-fade-up">{est.summary}</p>}
      </div>

      {/* Foreman review — final gate before the quote leaves the door */}
      <ForemanPanel report={foreman} />

      {/* Outcome + export — compact */}
      <div className="card p-3.5">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outcome · feeds learning</div>
        <Outcome id={id} />
        {!foreman.canExport && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            <IconWarning size={14} className="mt-0.5 shrink-0" />
            <span>Foreman's holding export — {foreman.blockers.length} blocker{foreman.blockers.length === 1 ? '' : 's'} to clear first. Fix the items above, then re-price.</span>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => downloadDocument(quote, profile, 'quote')}
            disabled={!foreman.canExport}
            className="btn-primary flex-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload size={15} /> Quote PDF
          </button>
          {(quote.status === 'won' || quote.status === 'invoiced') && (
            <button
              onClick={() => {
                useStore.getState().updateQuote(id, { status: 'invoiced' })
                downloadDocument(quote, profile, 'invoice')
              }}
              className="btn-ghost flex-1 text-xs"
            >
              <IconDoc size={15} /> Invoice
            </button>
          )}
        </div>
      </div>

      {/* Apprentice Memory — debrief once the job is done */}
      {(quote.status === 'won' || quote.status === 'invoiced') &&
        (quote.actuals ? (
          <DebriefCard id={id} onEdit={() => setDebrief(true)} />
        ) : (
          <button onClick={() => setDebrief(true)} className="flex w-full items-center justify-between gap-2 rounded-xl border border-sage-500/30 bg-sage-500/[0.06] p-3.5 text-left transition hover:bg-sage-500/[0.1]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sage-500/20 text-sage-400">
                <IconBrain size={18} />
              </div>
              <div className="text-xs">
                <div className="font-semibold text-slate-100">Job done? Log the actuals</div>
                <div className="text-slate-400">Final cost, profit &amp; what actually bit — teaches the apprentice.</div>
              </div>
            </div>
            <span className="text-sage-400">→</span>
          </button>
        ))}

      <JobDebriefSheet id={id} open={debrief} onClose={() => setDebrief(false)} />
    </div>
  )
}

function DebriefCard({ id, onEdit }: { id: string; onEdit: () => void }) {
  const quote = useStore((s) => s.getQuote(id))!
  const est = quote.estimate!
  const a = quote.actuals!
  const profit = a.finalRevenue - a.finalCost - a.surpriseCost
  const margin = a.finalRevenue > 0 ? Math.round((profit / a.finalRevenue) * 100) : 0
  const over = est.baseCost > 0 ? Math.round((a.finalCost / est.baseCost - 1) * 100) : 0
  const hit = a.hitHiddenCostIds.length
  return (
    <div className="card p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-sage-500/90">
          <IconBrain size={14} /> Debrief logged
        </span>
        <button onClick={onEdit} className="text-[11px] text-slate-400 hover:text-sage-400">
          edit
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <MiniStat label="Real profit" value={aud(profit)} tone={profit >= 0 ? 'sage' : undefined} />
        <MiniStat label="Margin" value={`${margin}%`} />
        <MiniStat label="vs estimate" value={`${over >= 0 ? '+' : ''}${over}%`} />
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
        {profit >= 0 ? `Made ${aud(profit)} on this one.` : `Lost ${aud(-profit)} here.`}{' '}
        {hit > 0 ? `${hit} of the flagged costs actually hit.` : 'None of the flagged costs landed.'}
        {a.surpriseCost > 0 && ` Surprise: ${aud(a.surpriseCost)}${a.surpriseNote ? ` (${a.surpriseNote})` : ''}.`}
      </p>
    </div>
  )
}

/* ----- Signature: the apprentice's commercial review ----- */
const VERDICT_STYLE: Record<Verdict, { border: string; badge: string; bar: string; icon: string }> = {
  stop: { border: 'border-danger/50', badge: 'bg-danger/15 text-danger border-danger/40', bar: 'bg-danger', icon: 'text-danger' },
  review: { border: 'border-amber/45', badge: 'bg-amber/15 text-amber border-amber/40', bar: 'bg-amber', icon: 'text-amber' },
  send: { border: 'border-sage-500/40', badge: 'bg-sage-500/15 text-sage-400 border-sage-500/40', bar: 'bg-sage-500', icon: 'text-sage-400' },
}

function CommercialReviewCard({ id, onRisks }: { id: string; onRisks: () => void }) {
  const quote = useStore((s) => s.getQuote(id))!
  const r = commercialReview(quote.spec, quote.estimate!)
  const s = VERDICT_STYLE[r.verdict]
  const [openItem, setOpenItem] = useState<number | null>(null)

  return (
    <div className={`overflow-hidden rounded-2xl border ${s.border} bg-ink-600 shadow-card`}>
      <div className={`h-1 w-full ${s.bar}`} />
      <div className="p-4">
        {/* Header: QUOTE COMPLETE + verdict */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            <IconBrain size={13} className={s.icon} /> Quote complete
          </div>
          <span className={`pill border ${s.badge}`}>
            {r.verdict === 'stop' ? <IconWarning size={11} /> : r.verdict === 'send' ? <IconCheck size={11} /> : null}
            {VERDICT_LABEL[r.verdict]}
          </span>
        </div>

        {/* Commercial metric grid — the decision numbers */}
        <div className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-ink-400 bg-ink-400">
          <ReviewMetric label="Total" value={aud(r.metrics.total)} tone="sage" />
          <ReviewMetric label="Margin" value={`${r.metrics.marginPct}%`} />
          <ReviewMetric label="Confidence" value={`${r.metrics.confidence}%`} tone={r.metrics.confidence < 60 ? 'amber' : undefined} />
          <ReviewMetric label="Risk" value={r.metrics.riskLevel} tone={r.metrics.riskTone} />
          <ReviewMetric label="Hidden costs" value={String(r.metrics.hiddenCount)} tone={r.metrics.hiddenCount ? 'amber' : undefined} />
          <ReviewMetric label="Missed profit" value={r.metrics.potentialLoss > 0 ? aud(r.metrics.potentialLoss) : '$0'} tone={r.metrics.potentialLoss > 0 ? 'danger' : 'sage'} />
        </div>

        {/* Apprentice review verdict line */}
        <div className="mb-3 rounded-xl border border-ink-400 bg-ink-700 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-sage-500/90">
            <IconBrain size={12} /> Apprentice review
          </div>
          <p className="text-sm font-medium leading-relaxed text-slate-100">{r.headline}</p>
        </div>

        {/* Forgotten checklist — the proactive stop */}
        {r.forgotten.length > 0 ? (
          <>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {r.verdict === 'stop' ? "You've forgotten" : 'Confirm before sending'}
            </div>
            <div className="space-y-1">
              {r.forgotten.map((f, i) => (
                <div key={i} className="overflow-hidden rounded-lg border border-ink-400 bg-ink-700">
                  <button onClick={() => setOpenItem(openItem === i ? null : i)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${f.kind === 'unconfirmed' ? 'bg-amber' : f.impact > 0 ? 'bg-danger' : 'bg-slate-500'}`} />
                    <span className="flex-1 truncate text-sm text-slate-200">{f.label}</span>
                    {f.impact > 0 && <span className="stat-num shrink-0 text-xs font-semibold text-danger">{aud(f.impact)}</span>}
                    <span className={`shrink-0 text-slate-600 transition ${openItem === i ? 'rotate-90' : ''}`}>›</span>
                  </button>
                  {openItem === i && <p className="border-t border-ink-400 px-3 py-2 text-xs leading-relaxed text-slate-400 animate-fade-up">{f.note}</p>}
                </div>
              ))}
            </div>

            {r.protectedProfit > 0 && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-sage-500/30 bg-sage-500/[0.07] px-3.5 py-2.5">
                <span className="text-xs text-slate-300">Fixing these protects</span>
                <span className="stat-num text-base font-bold text-sage-400">~{aud(r.protectedProfit)}</span>
              </div>
            )}

            <button onClick={onRisks} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-400 bg-ink-500 py-2 text-xs font-semibold text-slate-300 hover:border-ink-300">
              Review all risks <IconArrow size={14} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-sage-500/30 bg-sage-500/[0.06] px-3.5 py-2.5 text-sm text-slate-200">
            <IconCheck size={16} className="text-sage-400" /> Nothing missing on what you've told me. Good to send.
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewMetric({ label, value, tone }: { label: string; value: string; tone?: 'sage' | 'amber' | 'danger' | 'info' }) {
  const color =
    tone === 'sage' ? 'text-sage-400' : tone === 'amber' ? 'text-amber' : tone === 'danger' ? 'text-danger' : tone === 'info' ? 'text-info' : 'text-slate-100'
  return (
    <div className="bg-ink-600 px-2.5 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`stat-num text-sm font-bold leading-tight ${color}`}>{value}</div>
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'sage' }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value text-sm ${tone === 'sage' ? 'text-sage-400' : 'text-slate-100'}`}>{value}</div>
    </div>
  )
}

function Outcome({ id }: { id: string }) {
  const quote = useStore((s) => s.getQuote(id))!
  const updateQuote = useStore((s) => s.updateQuote)
  const opts: { k: typeof quote.status; label: string; tone: string }[] = [
    { k: 'sent', label: 'Sent', tone: 'amber' },
    { k: 'won', label: 'Won', tone: 'sage' },
    { k: 'lost', label: 'Lost', tone: 'danger' },
  ]
  return (
    <div className="flex gap-1.5">
      {opts.map((o) => {
        const on = quote.status === o.k || (o.k === 'won' && quote.status === 'invoiced')
        const cls = on
          ? o.tone === 'sage'
            ? 'border-sage-500 bg-sage-500/15 text-sage-400'
            : o.tone === 'danger'
              ? 'border-danger/50 bg-danger/15 text-danger'
              : 'border-amber/50 bg-amber/15 text-amber'
          : 'border-ink-400 bg-ink-500 text-slate-400'
        return (
          <button key={o.k} onClick={() => updateQuote(id, { status: o.k })} className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition ${cls}`}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Breakdown tab ---------------- */
const CAT_TINT: Record<CostCategory['key'], string> = {
  materials: 'text-sage-400',
  labour: 'text-info',
  machinery: 'text-amber',
  disposal: 'text-slate-300',
  delivery: 'text-sage-400',
}

function BreakdownTab({ id }: { id: string }) {
  const quote = useStore((s) => s.getQuote(id))!
  const ratebook = useStore((s) => s.ratebook)
  const updateQuote = useStore((s) => s.updateQuote)
  const [open, setOpen] = useState<string | null>('materials')
  const est = quote.estimate!

  const setMargin = (marginPct: number) => updateQuote(id, { estimate: estimate(quote.spec, { ...ratebook, defaultMarginPct: marginPct }) })

  return (
    <div className="space-y-2.5 animate-fade-up">
      {est.categories.map((cat) => (
        <div key={cat.key} className="card-flat overflow-hidden">
          <button onClick={() => setOpen(open === cat.key ? null : cat.key)} className="flex w-full items-center justify-between px-3.5 py-2.5">
            <span className={`text-sm font-semibold ${CAT_TINT[cat.key]}`}>{cat.title}</span>
            <span className="flex items-center gap-2">
              <span className="stat-num text-sm font-bold text-slate-200">{aud(cat.subtotal)}</span>
              <span className={`text-slate-500 transition ${open === cat.key ? 'rotate-90' : ''}`}>›</span>
            </span>
          </button>
          {open === cat.key && (
            <div className="border-t border-ink-400 px-3.5 py-1.5 animate-fade-up">
              {cat.items.map((it, i) => (
                <div key={i} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                  <div className="min-w-0">
                    <div className="text-slate-200">{it.label}</div>
                    <div className="text-[11px] text-slate-500">{it.qty} {it.unit} @ {aud(it.rate, true)}</div>
                  </div>
                  <div className="stat-num shrink-0 text-slate-300">{aud(it.total)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Margin + totals — compact */}
      <div className="card p-3.5">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-slate-400">Profit margin</span>
          <span className="stat-num font-bold text-sage-400">{est.marginPct}%</span>
        </div>
        <input type="range" min={5} max={45} value={est.marginPct} onChange={(e) => setMargin(parseInt(e.target.value, 10))} className="w-full accent-sage-500" />
        <div className="mt-2 space-y-1 border-t border-ink-400 pt-2 text-xs">
          <Row label="Build cost" value={aud(est.baseCost)} />
          {est.contingency > 0 && <Row label="Risk contingency" value={aud(est.contingency)} tone="text-amber" />}
          <Row label={`Margin (${est.marginPct}%)`} value={aud(est.marginAmount)} tone="text-sage-400" />
          <Row label="GST (10%)" value={aud(est.gst)} />
          <div className="!mt-1.5 border-t border-ink-400 pt-1.5">
            <Row label="Total inc GST" value={aud(est.expected)} big />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, tone, big }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={big ? 'font-bold text-slate-100' : 'text-slate-400'}>{label}</span>
      <span className={`stat-num ${big ? 'text-lg font-extrabold text-sage-400' : tone || 'text-slate-200'}`}>{value}</span>
    </div>
  )
}

/* ---------------- Risks tab ---------------- */
function RisksTab({ id }: { id: string }) {
  const quote = useStore((s) => s.getQuote(id))!
  const est = quote.estimate!
  const hc = est.hiddenCosts
  const excluded = hc.filter((h) => !h.included)
  const exposure = excluded.reduce((s, h) => s + h.estImpact, 0)

  if (hc.length === 0) {
    return (
      <div className="card flex items-center gap-3 p-4 text-sage-400 animate-fade-up">
        <IconCheck size={22} />
        <div>
          <div className="font-semibold">Nothing nasty spotted.</div>
          <p className="text-sm text-slate-400">Clean job on what you've told me. Still confirm the ground and access.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2.5 animate-fade-up">
      <div className="rounded-xl border border-sage-500/30 bg-sage-500/5 p-3 text-sm leading-relaxed text-slate-300">
        <span className="font-semibold text-sage-400">Apprentice's call:</span>{' '}
        {exposure > 0
          ? `~${aud(exposure)} of risk sits outside your price. Build it in or note it as an exclusion — don't just hope it doesn't come up.`
          : 'The risks here are already in your number. Send it with confidence.'}
      </div>
      {hc.map((h) => (
        <HiddenCard key={h.id} h={h} />
      ))}
    </div>
  )
}

function HiddenCard({ h }: { h: HiddenCost }) {
  const [open, setOpen] = useState(false)
  const tone = h.severity === 'critical' ? 'border-danger/40' : h.severity === 'high' ? 'border-amber/40' : 'border-ink-400'
  const sevCls =
    h.severity === 'critical'
      ? 'bg-danger/15 text-danger border-danger/30'
      : h.severity === 'high'
        ? 'bg-amber/15 text-amber border-amber/30'
        : h.severity === 'medium'
          ? 'bg-info/15 text-info border-info/30'
          : 'bg-ink-400/60 text-slate-300 border-ink-300'
  return (
    <div className={`card-flat border ${tone} overflow-hidden`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`pill border ${sevCls}`}>{h.severity}</span>
          <span className="truncate text-sm font-semibold text-slate-100">{h.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="stat-num text-sm font-bold text-amber">{aud(h.estImpact)}</span>
          <span className={`text-slate-500 transition ${open ? 'rotate-90' : ''}`}>›</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-ink-400 px-3.5 py-2.5 animate-fade-up">
          <p className="text-sm leading-relaxed text-slate-400">{h.why}</p>
          <div className="mt-1.5 text-[11px] uppercase tracking-wide text-slate-500">{h.included ? 'Allowed for in the quote' : 'Not yet in your price'}</div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Details tab (compact inline form) ---------------- */
function DetailsTab({ id, onRepriced }: { id: string; onRepriced: () => void }) {
  const quote = useStore((s) => s.getQuote(id))!
  const updateSpec = useStore((s) => s.updateSpec)
  const updateQuote = useStore((s) => s.updateQuote)
  const runEstimate = useStore((s) => s.runEstimate)
  const s = quote.spec
  const numv = (v: string) => (v === '' ? 0 : Math.max(0, parseFloat(v) || 0))

  return (
    <div className="space-y-3 animate-fade-up">
      <div className="card p-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <F label="Client"><input className="input !py-2 text-sm" value={quote.client} onChange={(e) => updateQuote(id, { client: e.target.value })} /></F>
          <F label="Area (m²)"><input type="number" className="input !py-2 text-sm" value={s.area || ''} onChange={(e) => updateSpec(id, { area: numv(e.target.value) })} /></F>
          <F label="Trade"><Sel value={s.trade} onChange={(v) => updateSpec(id, { trade: v as Trade })} options={Object.entries(TRADE_LABELS)} /></F>
          <F label="Job type"><Sel value={s.jobType} onChange={(v) => updateSpec(id, { jobType: v as JobType })} options={Object.entries(JOB_TYPE_LABELS)} /></F>
          <F label="Finish"><Sel value={s.finish} onChange={(v) => updateSpec(id, { finish: v as Finish })} options={Object.entries(FINISH_LABELS)} /></F>
          <F label="Thickness (mm)"><input type="number" className="input !py-2 text-sm" value={s.thicknessMm || ''} onChange={(e) => updateSpec(id, { thicknessMm: numv(e.target.value) })} /></F>
          <F label="Dig depth (mm)"><input type="number" className="input !py-2 text-sm" value={s.excavationDepthMm || ''} onChange={(e) => updateSpec(id, { excavationDepthMm: numv(e.target.value) })} /></F>
          <F label="Soil"><Sel value={s.soil} onChange={(v) => updateSpec(id, { soil: v as SoilType })} options={Object.entries(SOIL_LABELS)} /></F>
          <F label="Location">
            <input className="input !py-2 text-sm" list="locs" value={s.location} onChange={(e) => updateSpec(id, { location: e.target.value })} />
            <datalist id="locs">{LOCATIONS.map((l) => <option key={l.name} value={l.name} />)}</datalist>
          </F>
          <F label="Access"><Sel value={s.access} onChange={(v) => updateSpec(id, { access: v as Access })} options={[['easy', 'Easy'], ['moderate', 'Moderate'], ['difficult', 'Difficult']]} /></F>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Tog on={s.prepRequired} onClick={() => updateSpec(id, { prepRequired: !s.prepRequired })} label="Prep" />
          <Tog on={s.boxingRequired} onClick={() => updateSpec(id, { boxingRequired: !s.boxingRequired })} label="Boxing" />
          <Tog on={s.reinforcement} onClick={() => updateSpec(id, { reinforcement: !s.reinforcement })} label="Mesh" />
          <Tog on={s.pumpRequired} onClick={() => updateSpec(id, { pumpRequired: !s.pumpRequired })} label="Pump" />
        </div>
      </div>

      <button
        onClick={() => {
          runEstimate(id)
          onRepriced()
        }}
        className="btn-primary w-full"
      >
        <IconCheck size={18} /> Re-price the job
      </button>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      {children}
    </div>
  )
}
function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select className="input !py-2 appearance-none text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}
function Tog({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${on ? 'border-sage-500 bg-sage-500/15 text-sage-400' : 'border-ink-400 bg-ink-500 text-slate-400'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-sage-500' : 'bg-ink-300'}`} />
      {label}
    </button>
  )
}

function statusTone(status: string): string {
  const map: Record<string, string> = {
    draft: 'border-ink-300 bg-ink-400/40 text-slate-400',
    chatting: 'border-info/30 bg-info/10 text-info',
    estimated: 'border-sage-500/30 bg-sage-500/10 text-sage-400',
    sent: 'border-amber/30 bg-amber/10 text-amber',
    won: 'border-sage-500/40 bg-sage-500/15 text-sage-400',
    lost: 'border-danger/30 bg-danger/10 text-danger',
    invoiced: 'border-sage-500/40 bg-sage-500/15 text-sage-400',
  }
  return map[status] || map.draft
}
