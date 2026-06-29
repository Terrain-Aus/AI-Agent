import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Card, SectionTitle } from '../components/ui'
import { IconArrow, IconBack } from '../components/icons'
import {
  FINISH_LABELS,
  JOB_TYPE_LABELS,
  SOIL_LABELS,
  LOCATIONS,
} from '../engine/pricing'
import { TRADE_LABELS } from '../engine/apprentice'
import type { Access, Finish, JobType, SoilType, Trade } from '../engine/types'

export default function JobDetails() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const quote = useStore((s) => s.getQuote(id))
  const updateSpec = useStore((s) => s.updateSpec)
  const updateQuote = useStore((s) => s.updateQuote)
  const runEstimate = useStore((s) => s.runEstimate)

  if (!quote) return <div className="py-20 text-center text-slate-400">Quote not found.</div>
  const s = quote.spec

  const num = (v: string) => (v === '' ? 0 : Math.max(0, parseFloat(v) || 0))

  const recalc = () => {
    runEstimate(id)
    navigate(`/quote/${id}/preview`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost !px-2.5 !py-2">
          <IconBack size={18} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-slate-100">Job details</h1>
          <p className="text-sm text-slate-400">Fine-tune what the apprentice captured, then re-price.</p>
        </div>
      </div>

      <Card>
        <SectionTitle>Client &amp; scope</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client / site">
            <input className="input" value={quote.client} onChange={(e) => updateQuote(id, { client: e.target.value })} />
          </Field>
          <Field label="Trade">
            <Select value={s.trade} onChange={(v) => updateSpec(id, { trade: v as Trade })} options={Object.entries(TRADE_LABELS)} />
          </Field>
          <Field label="Job type">
            <Select value={s.jobType} onChange={(v) => updateSpec(id, { jobType: v as JobType })} options={Object.entries(JOB_TYPE_LABELS)} />
          </Field>
          <Field label="Finish">
            <Select value={s.finish} onChange={(v) => updateSpec(id, { finish: v as Finish })} options={Object.entries(FINISH_LABELS)} />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle>Measurements &amp; ground</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Area (m²)">
            <input type="number" className="input" value={s.area || ''} onChange={(e) => updateSpec(id, { area: num(e.target.value) })} />
          </Field>
          <Field label="Thickness (mm)">
            <input type="number" className="input" value={s.thicknessMm || ''} onChange={(e) => updateSpec(id, { thicknessMm: num(e.target.value) })} />
          </Field>
          <Field label="Excavation depth (mm)">
            <input type="number" className="input" value={s.excavationDepthMm || ''} onChange={(e) => updateSpec(id, { excavationDepthMm: num(e.target.value) })} />
          </Field>
          <Field label="Soil / ground">
            <Select value={s.soil} onChange={(v) => updateSpec(id, { soil: v as SoilType })} options={Object.entries(SOIL_LABELS)} />
          </Field>
          <Field label="Location">
            <input
              className="input"
              list="locations"
              value={s.location}
              onChange={(e) => updateSpec(id, { location: e.target.value })}
              placeholder="Town"
            />
            <datalist id="locations">
              {LOCATIONS.map((l) => (
                <option key={l.name} value={l.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Access">
            <Select
              value={s.access}
              onChange={(v) => updateSpec(id, { access: v as Access })}
              options={[
                ['easy', 'Easy — truck access'],
                ['moderate', 'Moderate'],
                ['difficult', 'Difficult'],
              ]}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Toggle on={s.prepRequired} onClick={() => updateSpec(id, { prepRequired: !s.prepRequired })} label="Site prep" />
          <Toggle on={s.boxingRequired} onClick={() => updateSpec(id, { boxingRequired: !s.boxingRequired })} label="Boxing / formwork" />
          <Toggle on={s.reinforcement} onClick={() => updateSpec(id, { reinforcement: !s.reinforcement })} label="Reinforced (mesh)" />
          <Toggle on={s.pumpRequired} onClick={() => updateSpec(id, { pumpRequired: !s.pumpRequired })} label="Concrete pump" />
        </div>
      </Card>

      <Card>
        <SectionTitle>Notes</SectionTitle>
        <textarea
          className="input min-h-[80px]"
          placeholder="Anything else — engineer's spec, client requests, site quirks…"
          value={s.notes}
          onChange={(e) => updateSpec(id, { notes: e.target.value })}
        />
      </Card>

      <button onClick={recalc} className="btn-primary w-full sm:w-auto">
        Re-price the job <IconArrow size={18} />
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select className="input appearance-none" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
        on ? 'border-sage-500 bg-sage-500/15 text-sage-400' : 'border-ink-400 bg-ink-500 text-slate-400'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${on ? 'bg-sage-500' : 'bg-ink-300'}`} />
      {label}
    </button>
  )
}
