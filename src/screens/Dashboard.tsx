import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Empty } from '../components/ui'
import { IconArrow, IconBrain, IconDoc, IconHard, IconPlus, IconWarning } from '../components/icons'
import { aud, relativeTime } from '../lib/format'
import { learnFrom } from '../engine/learning'
import { buildMemory } from '../engine/memory'
import { riskSummary } from '../engine/hiddenCosts'
import { JOB_TYPE_LABELS } from '../engine/pricing'
import type { Quote } from '../engine/types'

const STATUS_TONE: Record<Quote['status'], string> = {
  draft: 'text-slate-400 bg-ink-400/50',
  chatting: 'text-info bg-info/10',
  estimated: 'text-sage-400 bg-sage-500/10',
  sent: 'text-amber bg-amber/10',
  won: 'text-sage-400 bg-sage-500/15',
  lost: 'text-danger bg-danger/10',
  invoiced: 'text-sage-400 bg-sage-500/15',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = useStore((s) => s.user)
  const quotes = useStore((s) => s.quotes)
  const business = useStore((s) => s.business)
  const model = useMemo(() => learnFrom(quotes), [quotes])
  const memory = useMemo(() => buildMemory(quotes), [quotes])
  const [learnOpen, setLearnOpen] = useState(true)
  const [memOpen, setMemOpen] = useState(true)

  const priced = quotes.filter((q) => q.estimate)
  const pipeline = priced.filter((q) => ['estimated', 'sent'].includes(q.status))
  const pipelineValue = pipeline.reduce((s, q) => s + (q.estimate?.expected ?? 0), 0)
  const wonValue = quotes.filter((q) => q.status === 'won' || q.status === 'invoiced').reduce((s, q) => s + (q.estimate?.expected ?? 0), 0)
  const totalFlags = priced.reduce((s, q) => s + (q.estimate?.hiddenCosts.length ?? 0), 0)

  return (
    <div className="space-y-3">
      {/* Compact greeting row */}
      <div className="flex items-center justify-between pt-1">
        <div className="text-sm">
          <span className="text-slate-500">G'day{user?.name ? `, ${user.name.split(' ')[0]}` : ''} —</span>{' '}
          <span className="font-semibold text-slate-200">let's price some work</span>
        </div>
        <button onClick={() => navigate('/new')} className="btn-primary !px-3 !py-1.5 text-xs">
          <IconPlus size={15} /> New
        </button>
      </div>

      {/* First-run nudge: configure the commercial source of truth */}
      {!business.configured && (
        <button onClick={() => navigate('/business')} className="flex w-full items-center justify-between gap-2 rounded-xl border border-sage-500/30 bg-sage-500/[0.06] p-3 text-left transition hover:bg-sage-500/[0.1]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sage-500/20 text-sage-400">
              <IconHard size={18} />
            </div>
            <div className="text-xs">
              <div className="font-semibold text-slate-100">Finish setting up your business · 2 min</div>
              <div className="text-slate-400">Quote with your real rates, not generic ones. Feeds every quote.</div>
            </div>
          </div>
          <span className="text-sage-400">→</span>
        </button>
      )}

      {/* Dense KPI row */}
      <div className="grid grid-cols-4 gap-1.5">
        <DKpi label="Pipeline" value={aud(pipelineValue)} sub={`${pipeline.length} live`} tone="sage" />
        <DKpi label="Won" value={aud(wonValue)} sub={`${model.win.won} job${model.win.won === 1 ? '' : 's'}`} />
        <DKpi label="Win rate" value={model.win.winRate ? `${model.win.winRate}%` : '—'} sub={`${model.win.quoted} sent`} />
        <DKpi label="Traps" value={String(totalFlags)} sub="caught" tone={totalFlags ? 'amber' : undefined} />
      </div>

      {/* Apprentice learning — collapsible */}
      <div className="card overflow-hidden">
        <button onClick={() => setLearnOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sage-500/20 text-sage-400">
            <IconBrain size={16} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-bold text-slate-100">Apprentice learning</span>
            <span className="block text-[11px] text-slate-500">Smarter every job · {model.totalLearned} learned</span>
          </span>
          <span className={`text-slate-500 transition ${learnOpen ? 'rotate-90' : ''}`}>›</span>
        </button>
        {learnOpen && (
          <div className="border-t border-ink-400 px-3.5 py-3 animate-fade-up">
            <ul className="space-y-1.5">
              {model.takeaways.map((t, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-500" />
                  {t}
                </li>
              ))}
            </ul>
            {model.jobInsights.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {model.jobInsights.slice(0, 3).map((ins) => (
                  <div key={ins.jobType + ins.finish} className="kpi">
                    <div className="kpi-label truncate">{JOB_TYPE_LABELS[ins.jobType as keyof typeof JOB_TYPE_LABELS] ?? ins.jobType}</div>
                    <div className="kpi-value text-sm text-sage-400">
                      {aud(ins.avgPerM2)}<span className="text-[10px] font-normal text-slate-500">/m²</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {ins.samples}× ·{' '}
                      <span className={ins.trend === 'up' ? 'text-sage-400' : ins.trend === 'down' ? 'text-danger' : 'text-slate-500'}>
                        {ins.trend === 'up' ? '↑' : ins.trend === 'down' ? '↓' : '→'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Apprentice Memory — learns from completed-job debriefs */}
      <div className="card overflow-hidden border-sage-500/25 bg-gradient-to-br from-sage-500/[0.05] to-transparent">
        <button onClick={() => setMemOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sage-500/20 text-sage-400">
            <IconBrain size={16} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-bold text-slate-100">Apprentice memory</span>
            <span className="block text-[11px] text-slate-500">
              {memory.debriefed > 0 ? `${memory.debriefed} job${memory.debriefed === 1 ? '' : 's'} debriefed · real results` : 'Close out a job to start the learning loop'}
            </span>
          </span>
          <span className={`text-slate-500 transition ${memOpen ? 'rotate-90' : ''}`}>›</span>
        </button>
        {memOpen && (
          <div className="border-t border-ink-400 px-3.5 py-3 animate-fade-up">
            {memory.debriefed > 0 && (
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                <div className="kpi">
                  <div className="kpi-label">Banked</div>
                  <div className={`kpi-value text-sm ${memory.profitBanked >= 0 ? 'text-sage-400' : 'text-danger'}`}>{aud(memory.profitBanked)}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Margin</div>
                  <div className="kpi-value text-sm text-slate-100">{memory.avgRealisedMargin}%</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Estimate</div>
                  <div className="kpi-value text-sm text-slate-100">{memory.avgCostRatio ? `${memory.avgCostRatio >= 1 ? '+' : ''}${Math.round((memory.avgCostRatio - 1) * 100)}%` : '—'}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Flags hit</div>
                  <div className="kpi-value text-sm text-amber">{memory.hiddenCostHitRate}%</div>
                </div>
              </div>
            )}
            <ul className="space-y-1.5">
              {memory.takeaways.map((t, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-500" />
                  {t}
                </li>
              ))}
            </ul>
            {memory.calibration.filter((c) => c.flagged >= 2).length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Hidden-cost calibration</div>
                <div className="space-y-1">
                  {memory.calibration.filter((c) => c.flagged >= 2).slice(0, 4).map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-slate-300">{c.title}</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-400">
                        <div className={`h-full rounded-full ${c.hitRate >= 0.6 ? 'bg-amber' : 'bg-ink-300'}`} style={{ width: `${Math.round(c.hitRate * 100)}%` }} />
                      </div>
                      <span className="stat-num w-12 shrink-0 text-right text-slate-500">{c.hit}/{c.flagged}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent quotes — compact rows */}
      <div className="flex items-center justify-between px-1 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recent</span>
        {quotes.length > 0 && (
          <button onClick={() => navigate('/quotes')} className="text-[11px] text-sage-400">
            View all →
          </button>
        )}
      </div>
      {quotes.length === 0 ? (
        <Empty title="No quotes yet" icon={<IconDoc size={28} />}>
          Describe a job and the apprentice prices it in under a minute — hidden costs and all.
        </Empty>
      ) : (
        <div className="space-y-1.5">
          {quotes.slice(0, 6).map((q) => {
            const risk = q.estimate ? riskSummary(q.estimate.hiddenCosts) : null
            return (
              <button
                key={q.id}
                onClick={() => navigate(`/quote/${q.id}`)}
                className="card-flat flex w-full items-center gap-2.5 p-2.5 text-left transition hover:border-sage-500"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`pill ${STATUS_TONE[q.status]}`}>{q.status}</span>
                    {risk && risk.count > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber">
                        <IconWarning size={10} /> {risk.count}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-semibold text-slate-100">{q.title}</div>
                  <div className="truncate text-[11px] text-slate-500">{q.client || 'No client'} · {relativeTime(q.updatedAt)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="stat-num text-sm font-bold text-sage-400">{q.estimate ? aud(q.estimate.expected) : '—'}</div>
                  <IconArrow size={14} className="ml-auto text-slate-600" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DKpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'sage' | 'amber' }) {
  const color = tone === 'sage' ? 'text-sage-400' : tone === 'amber' ? 'text-amber' : 'text-slate-100'
  return (
    <div className="kpi">
      <div className="kpi-label truncate">{label}</div>
      <div className={`kpi-value text-[15px] ${color}`}>{value}</div>
      <div className="truncate text-[10px] text-slate-500">{sub}</div>
    </div>
  )
}
