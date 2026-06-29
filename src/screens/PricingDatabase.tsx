import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Card, SectionTitle } from '../components/ui'
import { IconBack, IconDatabase, IconWarning } from '../components/icons'
import { LOCATIONS } from '../engine/pricing'
import type { RateBook } from '../engine/pricing'

interface RateField {
  key: keyof RateBook
  label: string
  unit: string
  group: string
}

const FIELDS: RateField[] = [
  { key: 'concretePerM3', label: 'Concrete supply', unit: '$/m³', group: 'Materials' },
  { key: 'exposedAggPremiumM3', label: 'Exposed agg premium', unit: '$/m³', group: 'Materials' },
  { key: 'meshPerM2', label: 'Reo mesh (SL72)', unit: '$/m²', group: 'Materials' },
  { key: 'finishLabourPerM2', label: 'Finish labour (plain)', unit: '$/m²', group: 'Labour' },
  { key: 'prepLabourPerM2', label: 'Site prep labour', unit: '$/m²', group: 'Labour' },
  { key: 'boxingPerM', label: 'Boxing / formwork', unit: '$/lm', group: 'Labour' },
  { key: 'labourHourly', label: 'Crew chargeout', unit: '$/hr', group: 'Labour' },
  { key: 'pumpDayRate', label: 'Concrete pump', unit: '$/day', group: 'Machinery' },
  { key: 'excavatorHourly', label: 'Excavator (wet hire)', unit: '$/hr', group: 'Machinery' },
  { key: 'bobcatHourly', label: 'Bobcat (wet hire)', unit: '$/hr', group: 'Machinery' },
  { key: 'tipperHourly', label: 'Tipper cartage', unit: '$/hr', group: 'Machinery' },
  { key: 'disposalPerTonne', label: 'Tip fee (clean fill)', unit: '$/t', group: 'Disposal' },
  { key: 'disposalContaminatedPerTonne', label: 'Tip fee (contaminated)', unit: '$/t', group: 'Disposal' },
  { key: 'deliveryBaseM3', label: 'Concrete cartage (metro)', unit: '$/m³', group: 'Delivery' },
  { key: 'defaultMarginPct', label: 'Default margin', unit: '%', group: 'Margin' },
]

const GROUPS = ['Materials', 'Labour', 'Machinery', 'Disposal', 'Delivery', 'Margin']

export default function PricingDatabase() {
  const navigate = useNavigate()
  const ratebook = useStore((s) => s.ratebook)
  const updateRatebook = useStore((s) => s.updateRatebook)
  const resetRatebook = useStore((s) => s.resetRatebook)

  const setField = (key: keyof RateBook, value: number) => {
    if (key === 'finishLabourPerM2') {
      updateRatebook({ finishLabourPerM2: { ...ratebook.finishLabourPerM2, plain: value } })
    } else {
      updateRatebook({ [key]: value } as Partial<RateBook>)
    }
  }

  const valueOf = (key: keyof RateBook): number =>
    key === 'finishLabourPerM2' ? ratebook.finishLabourPerM2.plain : (ratebook[key] as number)

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/business')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-sage-400">
        <IconBack size={14} /> Business
      </button>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sage-400">
            <IconDatabase size={18} />
            <span className="text-xs font-bold uppercase tracking-wide">Advanced · Rate Book</span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-100">Engine rates</h1>
          <p className="text-sm text-slate-400">Low-level rates the estimator uses. Your Business profile projects into these.</p>
        </div>
        <button onClick={resetRatebook} className="btn-ghost text-xs">
          Reset
        </button>
      </div>

      {/* Reassure normal users this layer is optional */}
      <div className="flex items-start gap-2.5 rounded-xl border border-ink-400 bg-ink-700 p-3">
        <IconWarning size={15} className="mt-0.5 shrink-0 text-slate-500" />
        <p className="text-[11px] leading-relaxed text-slate-400">
          Most contractors never need this screen. Set your real rates in{' '}
          <button onClick={() => navigate('/business')} className="font-semibold text-sage-400 underline-offset-2 hover:underline">Business</button>
          {' '}— this is the raw engine layer it feeds. Only touch it if you want to override an individual estimator rate by hand.
        </p>
      </div>

      {GROUPS.map((group) => (
        <Card key={group}>
          <SectionTitle>{group}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.filter((f) => f.group === group).map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3 rounded-xl border border-ink-400 bg-ink-500 px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-200">{f.label}</div>
                  <div className="text-[11px] text-slate-500">{f.unit}</div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">{f.unit.startsWith('$') ? '$' : ''}</span>
                  <input
                    type="number"
                    value={valueOf(f.key)}
                    onChange={(e) => setField(f.key, parseFloat(e.target.value) || 0)}
                    className="w-20 rounded-lg border border-ink-400 bg-ink-600 px-2 py-1.5 text-right text-sm font-mono tabular-nums text-slate-100 outline-none focus:border-sage-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card>
        <SectionTitle hint="auto-applied by location">Location loadings</SectionTitle>
        <p className="mb-3 text-sm text-slate-400">
          The apprentice loads freight, travel and remote-supply premiums automatically based on the job's town.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-ink-400">
                <th className="py-2 pr-3 font-semibold">Town</th>
                <th className="py-2 pr-3 font-semibold">State</th>
                <th className="py-2 pr-3 text-right font-semibold">Freight ×</th>
                <th className="py-2 pr-3 text-right font-semibold">Supply +$/m³</th>
                <th className="py-2 text-right font-semibold">Remote</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {LOCATIONS.map((l) => (
                <tr key={l.name} className="border-b border-ink-400/50">
                  <td className="py-2 pr-3 font-medium text-slate-200">{l.name}</td>
                  <td className="py-2 pr-3 text-slate-500">{l.state}</td>
                  <td className="py-2 pr-3 text-right font-mono">{l.multiplier.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{l.supplyLoadM3}</td>
                  <td className="py-2 text-right">
                    {l.remote ? <span className="pill border border-amber/30 bg-amber/10 text-amber">remote</span> : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
