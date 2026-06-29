import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Card, Empty, SectionTitle, StatTile } from '../components/ui'
import { IconArrow, IconBrain, IconDoc, IconPlus, IconSpark, IconWarning } from '../components/icons'
import { aud, relativeTime } from '../lib/format'
import { learnFrom } from '../engine/learning'
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

  const priced = quotes.filter((q) => q.estimate)
  const pipeline = priced.filter((q) => ['estimated', 'sent'].includes(q.status))
  const pipelineValue = pipeline.reduce((s, q) => s + (q.estimate?.expected ?? 0), 0)
  const wonValue = quotes.filter((q) => q.status === 'won' || q.status === 'invoiced').reduce((s, q) => s + (q.estimate?.expected ?? 0), 0)
  const totalFlags = priced.reduce((s, q) => s + (q.estimate?.hiddenCosts.length ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-slate-400">G'day{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👷</p>
          <h1 className="text-2xl font-extrabold text-slate-100">Let's price some work</h1>
        </div>
        <button onClick={() => navigate('/new')} className="btn-primary hidden sm:inline-flex">
          <IconPlus size={18} /> New quote
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Pipeline" value={aud(pipelineValue)} sub={`${pipeline.length} live`} accent="sage" />
        <StatTile label="Won" value={aud(wonValue)} sub={`${model.win.won} job${model.win.won === 1 ? '' : 's'}`} />
        <StatTile label="Win rate" value={model.win.winRate ? `${model.win.winRate}%` : '—'} sub={`${model.win.quoted} quoted`} />
        <StatTile label="Traps caught" value={String(totalFlags)} accent="amber" sub="hidden costs" />
      </div>

      {/* Apprentice learning panel */}
      <Card className="border-sage-500/25 bg-gradient-to-br from-sage-500/[0.07] to-transparent">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sage-500/20 text-sage-400">
              <IconBrain size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Apprentice learning</h2>
              <p className="text-[11px] text-slate-500">Smarter every job · {model.totalLearned} learned</p>
            </div>
          </div>
          <IconSpark size={18} className="text-sage-500/60" />
        </div>

        <ul className="space-y-2">
          {model.takeaways.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-300">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-500" />
              {t}
            </li>
          ))}
        </ul>

        {model.jobInsights.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {model.jobInsights.slice(0, 3).map((ins) => (
              <div key={ins.jobType + ins.finish} className="card-flat p-3">
                <div className="truncate text-xs font-semibold text-slate-300">
                  {JOB_TYPE_LABELS[ins.jobType as keyof typeof JOB_TYPE_LABELS] ?? ins.jobType}
                </div>
                <div className="mt-0.5 stat-num text-lg font-bold text-sage-400">{aud(ins.avgPerM2)}<span className="text-xs font-normal text-slate-500">/m²</span></div>
                <div className="text-[10px] text-slate-500">
                  {ins.samples} job{ins.samples > 1 ? 's' : ''} ·{' '}
                  <span className={ins.trend === 'up' ? 'text-sage-400' : ins.trend === 'down' ? 'text-danger' : 'text-slate-500'}>
                    {ins.trend === 'up' ? '↑ rising' : ins.trend === 'down' ? '↓ slipping' : '→ steady'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recent quotes */}
      <div>
        <SectionTitle hint={quotes.length ? `${quotes.length} total` : undefined}>Recent quotes</SectionTitle>
        {quotes.length === 0 ? (
          <Empty title="No quotes yet" icon={<IconDoc size={32} />}>
            Describe a job and the apprentice will price it in under a minute — hidden costs and all.
          </Empty>
        ) : (
          <div className="space-y-2.5">
            {quotes.slice(0, 6).map((q) => (
              <button
                key={q.id}
                onClick={() => navigate(q.estimate ? `/quote/${q.id}/preview` : `/quote/${q.id}/chat`)}
                className="card-flat flex w-full items-center justify-between gap-3 p-3.5 text-left transition hover:border-sage-500"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`pill ${STATUS_TONE[q.status]}`}>{q.status}</span>
                    {(q.estimate?.hiddenCosts.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber">
                        <IconWarning size={11} /> {q.estimate!.hiddenCosts.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-100">{q.title}</div>
                  <div className="truncate text-xs text-slate-500">
                    {q.client || 'No client'} · {relativeTime(q.updatedAt)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="stat-num font-bold text-sage-400">{q.estimate ? aud(q.estimate.expected) : '—'}</div>
                  <IconArrow size={16} className="ml-auto mt-1 text-slate-600" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile new-quote CTA */}
      <button onClick={() => navigate('/new')} className="btn-primary w-full sm:hidden">
        <IconPlus size={18} /> New quote
      </button>
    </div>
  )
}
