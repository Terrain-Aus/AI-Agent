import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Card, Empty, SectionTitle, SeverityBadge, StatTile } from '../components/ui'
import { IconArrow, IconBack, IconCheck, IconWarning } from '../components/icons'
import { aud } from '../lib/format'
import type { HiddenCost } from '../engine/types'

export default function HiddenCosts() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const quote = useStore((s) => s.getQuote(id))

  if (!quote) return <div className="py-20 text-center text-slate-400">Quote not found.</div>
  if (!quote.estimate) {
    return (
      <div className="py-20 text-center">
        <Empty title="No estimate yet" icon={<IconWarning size={32} />}>
          Price the job first and the apprentice will surface every hidden cost it can find.
        </Empty>
        <button className="btn-primary mt-5" onClick={() => navigate(`/quote/${id}/chat`)}>
          Talk to the apprentice
        </button>
      </div>
    )
  }

  const hc = quote.estimate.hiddenCosts
  const included = hc.filter((h) => h.included)
  const excluded = hc.filter((h) => !h.included)
  const totalExposure = hc.reduce((s, h) => s + h.estImpact, 0)
  const excludedExposure = excluded.reduce((s, h) => s + h.estImpact, 0)
  const criticals = hc.filter((h) => h.severity === 'critical').length

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost !px-2.5 !py-2">
          <IconBack size={18} />
        </button>
        <div>
          <div className="flex items-center gap-2 text-amber">
            <IconWarning size={16} />
            <span className="text-xs font-bold uppercase tracking-wide">Hidden Cost Intelligence</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-100">What contractors miss on this job</h1>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Flags raised" value={String(hc.length)} accent={hc.length ? 'amber' : 'sage'} />
        <StatTile label="Total exposure" value={aud(totalExposure)} accent="amber" sub="if all missed" />
        <StatTile label="Critical" value={String(criticals)} accent={criticals ? 'danger' : 'sage'} />
      </div>

      {hc.length === 0 ? (
        <Card>
          <div className="flex items-center gap-3 text-sage-400">
            <IconCheck size={22} />
            <div>
              <div className="font-semibold">Nothing nasty spotted.</div>
              <p className="text-sm text-slate-400">
                Clean job on what you've told me. Still — confirm the ground and access before you commit.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {excluded.length > 0 && (
            <div>
              <SectionTitle hint={`+${aud(excludedExposure)} not in the price`}>
                ⚠ Not yet in your number
              </SectionTitle>
              <div className="space-y-3">
                {excluded.map((h) => (
                  <HiddenCard key={h.id} h={h} />
                ))}
              </div>
            </div>
          )}

          {included.length > 0 && (
            <div>
              <SectionTitle hint="already covered">✓ Allowed for in the quote</SectionTitle>
              <div className="space-y-3">
                {included.map((h) => (
                  <HiddenCard key={h.id} h={h} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Card className="border-sage-500/30 bg-sage-500/5">
        <p className="text-sm leading-relaxed text-slate-300">
          <span className="font-semibold text-sage-400">Apprentice's call:</span>{' '}
          {excluded.length > 0
            ? `There's about ${aud(excludedExposure)} of risk sitting outside your price. Either build it in, or put it on the quote as an exclusion so the client knows it's extra. Don't just hope it doesn't come up.`
            : `The risks here are already baked into your number. You're covered — send it with confidence.`}
        </p>
      </Card>

      <button onClick={() => navigate(`/quote/${id}/preview`)} className="btn-primary w-full sm:w-auto">
        Back to the quote <IconArrow size={18} />
      </button>
    </div>
  )
}

function HiddenCard({ h }: { h: HiddenCost }) {
  const tone =
    h.severity === 'critical'
      ? 'border-danger/40'
      : h.severity === 'high'
        ? 'border-amber/40'
        : 'border-ink-400'
  return (
    <div className={`card-flat border ${tone} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={h.severity} />
          <h3 className="font-semibold text-slate-100">{h.title}</h3>
        </div>
        <div className="text-right">
          <div className="stat-num text-sm font-bold text-amber">{aud(h.estImpact)}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{h.included ? 'included' : 'extra'}</div>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{h.why}</p>
    </div>
  )
}
