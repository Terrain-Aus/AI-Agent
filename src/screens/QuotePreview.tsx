import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Card, EstimateBand, SectionTitle, StatTile } from '../components/ui'
import {
  IconBack,
  IconBrain,
  IconCheck,
  IconDoc,
  IconDownload,
  IconWarning,
} from '../components/icons'
import { aud, pct } from '../lib/format'
import { estimate } from '../engine/estimator'
import { downloadDocument } from '../lib/pdf'
import { JOB_TYPE_LABELS } from '../engine/pricing'
import type { CostCategory } from '../engine/types'

const CATEGORY_META: Record<CostCategory['key'], { tint: string }> = {
  materials: { tint: 'text-sage-400' },
  labour: { tint: 'text-info' },
  machinery: { tint: 'text-amber' },
  disposal: { tint: 'text-slate-300' },
  delivery: { tint: 'text-sage-400' },
}

export default function QuotePreview() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const quote = useStore((s) => s.getQuote(id))
  const profile = useStore((s) => s.profile)
  const ratebook = useStore((s) => s.ratebook)
  const updateQuote = useStore((s) => s.updateQuote)
  const [open, setOpen] = useState<string | null>('materials')

  if (!quote) return <div className="py-20 text-center text-slate-400">Quote not found.</div>
  if (!quote.estimate) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-slate-400">This quote hasn't been priced yet.</p>
        <button className="btn-primary" onClick={() => navigate(`/quote/${id}/chat`)}>
          Talk to the apprentice
        </button>
      </div>
    )
  }

  const est = quote.estimate

  // Live margin re-pricing without leaving the screen.
  const setMargin = (marginPct: number) => {
    const next = estimate(quote.spec, { ...ratebook, defaultMarginPct: marginPct })
    updateQuote(id, { estimate: next })
  }

  const excludedExposure = est.hiddenCosts.filter((h) => !h.included).reduce((s, h) => s + h.estImpact, 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 no-print">
        <button onClick={() => navigate('/')} className="btn-ghost !px-2.5 !py-2">
          <IconBack size={18} />
        </button>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/quote/${id}/details`)} className="btn-ghost text-xs">
            Edit job
          </button>
          <button onClick={() => downloadDocument(quote, profile, 'quote')} className="btn-primary text-xs">
            <IconDownload size={16} /> Export PDF
          </button>
        </div>
      </div>

      {/* Headline */}
      <Card>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {quote.client || 'Quote'} · {JOB_TYPE_LABELS[quote.spec.jobType]}
          </span>
          <span className="pill border border-sage-500/30 bg-sage-500/10 text-sage-400">
            {pct(est.confidence)} confidence
          </span>
        </div>
        <EstimateBand low={est.low} expected={est.expected} high={est.high} />

        <div className="mt-4 rounded-xl border border-sage-500/20 bg-sage-500/[0.06] p-3.5">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sage-500/90">
            <IconBrain size={14} /> Apprentice's summary
          </div>
          <p className="text-sm leading-relaxed text-slate-300">{est.summary}</p>
        </div>
      </Card>

      {/* Hidden cost alert strip */}
      {est.hiddenCosts.length > 0 && (
        <button
          onClick={() => navigate(`/quote/${id}/hidden-costs`)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber/30 bg-amber/[0.07] p-4 text-left transition hover:bg-amber/[0.12] no-print"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber/15 text-amber">
              <IconWarning size={20} />
            </div>
            <div>
              <div className="font-semibold text-slate-100">
                {est.hiddenCosts.length} hidden cost{est.hiddenCosts.length > 1 ? 's' : ''} flagged
              </div>
              <div className="text-xs text-slate-400">
                {excludedExposure > 0 ? `${aud(excludedExposure)} of risk outside your price — review before sending.` : 'All allowed for. Tap to review.'}
              </div>
            </div>
          </div>
          <span className="text-amber">→</span>
        </button>
      )}

      {/* Cost breakdown */}
      <div>
        <SectionTitle hint={`Build cost ${aud(est.baseCost)}`}>Breakdown</SectionTitle>
        <div className="space-y-2.5">
          {est.categories.map((cat) => (
            <div key={cat.key} className="card-flat overflow-hidden">
              <button
                onClick={() => setOpen(open === cat.key ? null : cat.key)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className={`text-sm font-semibold ${CATEGORY_META[cat.key].tint}`}>{cat.title}</span>
                <span className="flex items-center gap-2">
                  <span className="stat-num text-sm font-bold text-slate-200">{aud(cat.subtotal)}</span>
                  <span className={`text-slate-500 transition ${open === cat.key ? 'rotate-90' : ''}`}>›</span>
                </span>
              </button>
              {open === cat.key && (
                <div className="border-t border-ink-400 px-4 py-2 animate-fade-up">
                  {cat.items.map((it, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                      <div>
                        <div className="text-slate-200">{it.label}</div>
                        <div className="text-xs text-slate-500">
                          {it.detail} · {it.qty} {it.unit} @ {aud(it.rate, true)}
                        </div>
                      </div>
                      <div className="stat-num shrink-0 text-slate-300">{aud(it.total)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Margin control + totals */}
      <Card>
        <SectionTitle>Margin &amp; totals</SectionTitle>
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-slate-400">Profit margin</span>
            <span className="stat-num font-bold text-sage-400">{est.marginPct}%</span>
          </div>
          <input
            type="range"
            min={5}
            max={45}
            value={est.marginPct}
            onChange={(e) => setMargin(parseInt(e.target.value, 10))}
            className="w-full accent-sage-500"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-600">
            <span>Lean 5%</span>
            <span>Healthy 22%</span>
            <span>Premium 45%</span>
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          <Row label="Build cost" value={aud(est.baseCost)} />
          {est.contingency > 0 && <Row label="Risk contingency" value={aud(est.contingency)} tone="text-amber" />}
          <Row label={`Margin (${est.marginPct}%)`} value={aud(est.marginAmount)} tone="text-sage-400" />
          <Row label="Subtotal (ex GST)" value={aud(est.subtotalExGst)} />
          <Row label="GST (10%)" value={aud(est.gst)} />
          <div className="my-2 border-t border-ink-400" />
          <Row label="Total (inc GST)" value={aud(est.expected)} big />
        </div>
      </Card>

      {/* Margin tiles */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="You keep" value={aud(est.marginAmount)} accent="sage" sub="gross profit" />
        <StatTile label="Per m²" value={quote.spec.area ? aud(est.expected / quote.spec.area) : '—'} sub="inc GST" />
        <StatTile label="Build cost" value={aud(est.baseCost)} sub="your outlay" />
      </div>

      {/* Outcome / invoicing */}
      <Card>
        <SectionTitle hint="feeds the apprentice's learning">Outcome</SectionTitle>
        <p className="mb-3 text-sm text-slate-400">
          Tell the apprentice how it landed. It learns from every result to sharpen your next quote.
        </p>
        <div className="flex flex-wrap gap-2">
          <OutcomeBtn active={quote.status === 'sent'} label="Sent" onClick={() => updateQuote(id, { status: 'sent' })} />
          <OutcomeBtn active={quote.status === 'won'} label="Won" tone="sage" icon onClick={() => updateQuote(id, { status: 'won' })} />
          <OutcomeBtn active={quote.status === 'lost'} label="Lost" tone="danger" onClick={() => updateQuote(id, { status: 'lost' })} />
        </div>
        {(quote.status === 'won' || quote.status === 'invoiced') && (
          <button
            onClick={() => {
              updateQuote(id, { status: 'invoiced' })
              downloadDocument(quote, profile, 'invoice')
            }}
            className="btn-ghost mt-3 w-full sm:w-auto"
          >
            <IconDoc size={16} /> Generate tax invoice
          </button>
        )}
      </Card>
    </div>
  )
}

function Row({ label, value, tone, big }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={big ? 'font-bold text-slate-100' : 'text-slate-400'}>{label}</span>
      <span className={`stat-num ${big ? 'text-xl font-extrabold text-sage-400' : tone || 'text-slate-200'}`}>{value}</span>
    </div>
  )
}

function OutcomeBtn({
  active,
  label,
  onClick,
  tone = 'default',
  icon = false,
}: {
  active: boolean
  label: string
  onClick: () => void
  tone?: 'default' | 'sage' | 'danger'
  icon?: boolean
}) {
  const color =
    active && tone === 'sage'
      ? 'border-sage-500 bg-sage-500/15 text-sage-400'
      : active && tone === 'danger'
        ? 'border-danger/50 bg-danger/15 text-danger'
        : active
          ? 'border-slate-500 bg-ink-400/50 text-slate-200'
          : 'border-ink-400 bg-ink-500 text-slate-400'
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${color}`}>
      {icon && active && <IconCheck size={16} />}
      {label}
    </button>
  )
}
