import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Empty, StatTile } from '../components/ui'
import { IconDoc, IconPlus, IconWarning } from '../components/icons'
import { aud, relativeTime } from '../lib/format'
import type { Quote } from '../engine/types'

const FILTERS: { key: string; label: string; match: (q: Quote) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'live', label: 'Live', match: (q) => ['draft', 'chatting', 'estimated', 'sent'].includes(q.status) },
  { key: 'won', label: 'Won', match: (q) => q.status === 'won' || q.status === 'invoiced' },
  { key: 'lost', label: 'Lost', match: (q) => q.status === 'lost' },
]

const STATUS_TONE: Record<string, string> = {
  draft: 'text-slate-400 bg-ink-400/50',
  chatting: 'text-info bg-info/10',
  estimated: 'text-sage-400 bg-sage-500/10',
  sent: 'text-amber bg-amber/10',
  won: 'text-sage-400 bg-sage-500/15',
  lost: 'text-danger bg-danger/10',
  invoiced: 'text-sage-400 bg-sage-500/15',
}

export default function Quotes() {
  const navigate = useNavigate()
  const quotes = useStore((s) => s.quotes)
  const deleteQuote = useStore((s) => s.deleteQuote)
  const [filter, setFilter] = useState('all')

  const active = FILTERS.find((f) => f.key === filter)!
  const list = quotes.filter(active.match)
  const totalValue = list.reduce((s, q) => s + (q.estimate?.expected ?? 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-100">Quotes</h1>
        <button onClick={() => navigate('/new')} className="btn-primary text-sm">
          <IconPlus size={18} /> New
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Showing" value={String(list.length)} sub={active.label.toLowerCase()} />
        <StatTile label="Value" value={aud(totalValue)} accent="sage" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === f.key ? 'bg-sage-500 text-ink-900' : 'border border-ink-400 bg-ink-500 text-slate-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty title="Nothing here yet" icon={<IconDoc size={32} />}>
          {filter === 'all' ? 'Start your first quote and it’ll show up here.' : 'No quotes match this filter.'}
        </Empty>
      ) : (
        <div className="space-y-2.5">
          {list.map((q) => (
            <div key={q.id} className="card-flat flex items-center justify-between gap-3 p-3.5 transition hover:border-sage-500">
              <button
                onClick={() => navigate(q.estimate ? `/quote/${q.id}/preview` : `/quote/${q.id}/chat`)}
                className="min-w-0 flex-1 text-left"
              >
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
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="stat-num font-bold text-sage-400">{q.estimate ? aud(q.estimate.expected) : '—'}</div>
                <button
                  onClick={() => {
                    if (confirm('Delete this quote?')) deleteQuote(q.id)
                  }}
                  className="text-[11px] text-slate-600 hover:text-danger"
                >
                  delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
