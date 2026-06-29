import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Card, SectionTitle } from '../components/ui'
import { IconArrow, IconBrain, IconSpark } from '../components/icons'
import { parseDescription, buildSpec, openingLine, TRADE_LABELS } from '../engine/apprentice'
import { JOB_TYPE_LABELS } from '../engine/pricing'
import { uid } from '../lib/format'

const EXAMPLES = [
  '80m² exposed aggregate driveway in Mt Isa, needs prep and boxing.',
  '120m² shed slab in Townsville, 125mm, reactive clay, tight access.',
  '45m² coloured patio in Cairns, already prepped, broom finish.',
  'Bulk excavation 200m² site in Mount Isa, suspect rock, cart spoil off.',
]

export default function NewQuote() {
  const navigate = useNavigate()
  const createQuote = useStore((s) => s.createQuote)
  const addMessage = useStore((s) => s.addMessage)
  const [text, setText] = useState('')
  const [client, setClient] = useState('')

  const start = (description: string) => {
    const parsed = parseDescription(description)
    const spec = buildSpec(parsed)
    const q = createQuote({ spec, client, title: 'New Quote' })
    // Seed the chat with the apprentice's opening read.
    addMessage(q.id, {
      id: uid('m_'),
      role: 'apprentice',
      text: openingLine(spec),
      ts: Date.now(),
    })
    navigate(`/quote/${q.id}/chat`)
  }

  const parsedPreview = text.trim() ? buildSpec(parseDescription(text)) : null

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 text-sage-400">
          <IconBrain size={18} />
          <span className="text-xs font-bold uppercase tracking-wide">New Quote</span>
        </div>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-100">Describe the job</h1>
        <p className="mt-1 text-sm text-slate-400">
          Talk to the apprentice like you would on site. Rough is fine — it'll ask what it needs.
        </p>
      </div>

      <Card>
        <label className="label">Client / site (optional)</label>
        <input
          className="input mb-4"
          placeholder="e.g. J. Smith — 14 Miner St"
          value={client}
          onChange={(e) => setClient(e.target.value)}
        />

        <label className="label">Rough job description</label>
        <textarea
          className="input min-h-[120px] resize-y leading-relaxed"
          placeholder='e.g. "80m² exposed aggregate driveway in Mt Isa, needs prep and boxing."'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {parsedPreview && (
          <div className="mt-3 flex flex-wrap gap-2 animate-fade-up">
            <Tag>{TRADE_LABELS[parsedPreview.trade]}</Tag>
            <Tag>{JOB_TYPE_LABELS[parsedPreview.jobType]}</Tag>
            {parsedPreview.area > 0 && <Tag>{parsedPreview.area} m²</Tag>}
            {parsedPreview.location && <Tag>{parsedPreview.location}</Tag>}
            {parsedPreview.finish !== 'plain' && parsedPreview.finish !== 'na' && (
              <Tag>{parsedPreview.finish.replace('-', ' ')}</Tag>
            )}
          </div>
        )}

        <button
          className="btn-primary mt-4 w-full sm:w-auto"
          disabled={!text.trim()}
          onClick={() => start(text)}
        >
          Hand it to the apprentice <IconArrow size={18} />
        </button>
      </Card>

      <div>
        <SectionTitle hint="tap to try">
          <span className="inline-flex items-center gap-1.5">
            <IconSpark size={14} /> Example jobs
          </span>
        </SectionTitle>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => start(ex)}
              className="card-flat group p-3.5 text-left transition hover:border-sage-500"
            >
              <p className="text-sm text-slate-300 group-hover:text-slate-100">{ex}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-lg border border-sage-500/30 bg-sage-500/10 px-2.5 py-1 text-xs font-medium capitalize text-sage-400">
      {children}
    </span>
  )
}
