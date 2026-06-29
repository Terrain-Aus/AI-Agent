import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { IconArrow, IconBrain, IconHard, IconSpark } from '../components/icons'
import { parseDescription, buildSpec, openingLine, TRADE_LABELS } from '../engine/apprentice'
import { JOB_TYPE_LABELS } from '../engine/pricing'

const EXAMPLES = [
  '80m² exposed aggregate driveway in Mt Isa, needs prep and boxing.',
  '120m² shed slab in Townsville, 125mm, reactive clay, tight access.',
  '45m² coloured patio in Cairns, already prepped, broom finish.',
  'Bulk excavation 200m² site in Mount Isa, suspect rock, cart spoil off.',
]

export default function NewQuote() {
  const navigate = useNavigate()
  const createQuote = useStore((s) => s.createQuote)
  const createSiteQuote = useStore((s) => s.createSiteQuote)
  const addMessage = useStore((s) => s.addMessage)
  const configured = useStore((s) => s.business.configured)
  const [text, setText] = useState('')
  const [client, setClient] = useState('')

  const startSiteQuote = () => {
    const sq = createSiteQuote({ client, title: client ? `${client} — site quote` : 'Site quote' })
    navigate(`/site/${sq.id}`)
  }

  const start = (description: string) => {
    const spec = buildSpec(parseDescription(description))
    const q = createQuote({ spec, client, title: 'New Quote' })
    addMessage(q.id, { id: 'seed-opening', role: 'apprentice', text: openingLine(spec), ts: Date.now() })
    navigate(`/quote/${q.id}/chat`)
  }

  const preview = text.trim() ? buildSpec(parseDescription(text)) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pt-1">
        <IconBrain size={18} className="text-sage-400" />
        <h1 className="text-lg font-extrabold text-slate-100">New quote</h1>
        <span className="ml-auto text-[11px] text-slate-500">Talk to it like you're on site</span>
      </div>

      {/* Rate source — where the numbers come from */}
      <button
        onClick={() => navigate('/business')}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11px] ${
          configured ? 'border-ink-400 bg-ink-700 text-slate-400' : 'border-amber/30 bg-amber/[0.07] text-slate-300'
        }`}
      >
        <IconHard size={14} className={configured ? 'text-sage-400' : 'text-amber'} />
        {configured ? (
          <span className="flex-1">Priced with <span className="font-semibold text-slate-200">your business rates</span>.</span>
        ) : (
          <span className="flex-1">Using <span className="font-semibold text-amber">starter rates</span> — set up your Business profile to quote with yours.</span>
        )}
        <span className="text-slate-500">›</span>
      </button>

      <div className="card p-3.5">
        <input
          className="input mb-2 !py-2 text-sm"
          placeholder="Client / site (optional)"
          value={client}
          onChange={(e) => setClient(e.target.value)}
        />
        <textarea
          className="input min-h-[96px] resize-y text-sm leading-relaxed"
          placeholder='e.g. "80m² exposed aggregate driveway in Mt Isa, needs prep and boxing."'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {preview && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 animate-fade-up">
            <Tag>{TRADE_LABELS[preview.trade]}</Tag>
            <Tag>{JOB_TYPE_LABELS[preview.jobType]}</Tag>
            {preview.area > 0 && <Tag>{preview.area} m²</Tag>}
            {preview.location && <Tag>{preview.location}</Tag>}
            {preview.finish !== 'plain' && preview.finish !== 'na' && <Tag>{preview.finish.replace('-', ' ')}</Tag>}
          </div>
        )}

        <button className="btn-primary mt-3 w-full" disabled={!text.trim()} onClick={() => start(text)}>
          Hand it to the apprentice <IconArrow size={18} />
        </button>
      </div>

      {/* Detailed site pipeline — structured walkthrough → validation → review */}
      <button onClick={startSiteQuote} className="card-flat group flex w-full items-center gap-3 p-3 text-left transition hover:border-sage-500">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-500 text-sage-400">
          <IconHard size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-100">Detailed site quote</div>
          <div className="text-[11px] text-slate-500">Walk the site → hidden costs → risk → validate → review. Quantity-first.</div>
        </div>
        <IconArrow size={15} className="shrink-0 text-slate-600 group-hover:text-sage-400" />
      </button>

      <div className="flex items-center gap-1.5 px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <IconSpark size={13} /> Tap an example
      </div>
      <div className="space-y-1.5">
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => start(ex)} className="card-flat group flex w-full items-center gap-2 p-3 text-left transition hover:border-sage-500">
            <p className="flex-1 text-sm text-slate-300 group-hover:text-slate-100">{ex}</p>
            <IconArrow size={15} className="shrink-0 text-slate-600 group-hover:text-sage-400" />
          </button>
        ))}
      </div>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-sage-500/30 bg-sage-500/10 px-2 py-0.5 text-[11px] font-medium capitalize text-sage-400">{children}</span>
}
