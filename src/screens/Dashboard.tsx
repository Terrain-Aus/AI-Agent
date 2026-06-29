import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Empty } from '../components/ui'
import { IconArrow, IconBrain, IconDoc, IconPlus, IconWarning } from '../components/icons'
import { aud, relativeTime } from '../lib/format'
import { learnFrom } from '../engine/learning'
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
  const model = useMemo(() => learnFrom(quotes), [quotes])
  const [learnOpen, setLearnOpen] = useState(true)

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
