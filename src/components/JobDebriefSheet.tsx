// Job Debrief — the post-job form that powers Apprentice Memory.
// Opens as a bottom sheet from a won/completed quote. Captures what actually
// happened so the apprentice can learn from real results.

import { useState } from 'react'
import { useStore } from '../store/useStore'
import BottomSheet from './BottomSheet'
import { aud } from '../lib/format'
import { IconCheck } from './icons'
import type { JobActuals } from '../engine/types'

export default function JobDebriefSheet({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const quote = useStore((s) => s.getQuote(id))
  const logActuals = useStore((s) => s.logActuals)
  const est = quote?.estimate

  const [finalCost, setFinalCost] = useState<string>('')
  const [finalRevenue, setFinalRevenue] = useState<string>('')
  const [hit, setHit] = useState<Set<string>>(new Set(quote?.actuals?.hitHiddenCostIds ?? []))
  const [surpriseCost, setSurpriseCost] = useState<string>('')
  const [surpriseNote, setSurpriseNote] = useState<string>('')

  if (!quote || !est) return null

  // Prefill from the estimate / existing debrief the first time the sheet opens.
  const cost = finalCost !== '' ? finalCost : String(quote.actuals?.finalCost ?? est.baseCost)
  const revenue = finalRevenue !== '' ? finalRevenue : String(quote.actuals?.finalRevenue ?? est.expected)

  const costN = Math.max(0, parseFloat(cost) || 0)
  const revN = Math.max(0, parseFloat(revenue) || 0)
  const surpN = Math.max(0, parseFloat(surpriseCost) || quote.actuals?.surpriseCost || 0)
  const profit = revN - costN - surpN
  const marginPct = revN > 0 ? Math.round((profit / revN) * 100) : 0

  const save = () => {
    const actuals: JobActuals = {
      loggedAt: Date.now(),
      finalCost: costN,
      finalRevenue: revN,
      hitHiddenCostIds: [...hit],
      surpriseCost: surpN,
      surpriseNote: surpriseNote || quote.actuals?.surpriseNote || '',
      madeMoney: profit > 0,
    }
    logActuals(id, actuals)
    onClose()
  }

  const toggle = (hid: string) =>
    setHit((s) => {
      const n = new Set(s)
      n.has(hid) ? n.delete(hid) : n.add(hid)
      return n
    })

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      size="lg"
      title="Job debrief"
      subtitle="What actually happened — feeds Apprentice Memory"
      footer={
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Real profit</div>
            <div className={`stat-num text-base font-bold ${profit >= 0 ? 'text-sage-400' : 'text-danger'}`}>
              {aud(profit)} <span className="text-xs font-normal text-slate-500">· {marginPct}% margin</span>
            </div>
          </div>
          <button onClick={save} className="btn-primary">
            <IconCheck size={18} /> Save debrief
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Money */}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Final build cost" hint={`quoted ${aud(est.baseCost)}`}>
            <MoneyInput value={cost} onChange={setFinalCost} />
          </Field>
          <Field label="What you got paid" hint={`quoted ${aud(est.expected)}`}>
            <MoneyInput value={revenue} onChange={setFinalRevenue} />
          </Field>
        </div>

        {/* Made money? quick read */}
        <div className={`rounded-xl border p-3 text-sm ${profit >= 0 ? 'border-sage-500/30 bg-sage-500/5 text-slate-300' : 'border-danger/40 bg-danger/5 text-slate-300'}`}>
          {profit >= 0 ? (
            <>You cleared <span className="font-bold text-sage-400">{aud(profit)}</span> on this one. {marginPct < (est.marginPct - 5) ? 'Thinner than you quoted — worth knowing why.' : 'On the money.'}</>
          ) : (
            <>This job <span className="font-bold text-danger">lost {aud(-profit)}</span>. Tell me what bit below so I flag it next time.</>
          )}
        </div>

        {/* Which hidden costs actually hit */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Which flagged costs actually happened?</div>
          {est.hiddenCosts.length === 0 ? (
            <p className="text-xs text-slate-500">Nothing was flagged on this quote.</p>
          ) : (
            <div className="space-y-1.5">
              {est.hiddenCosts.map((h) => {
                const on = hit.has(h.id)
                return (
                  <button
                    key={h.id}
                    onClick={() => toggle(h.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      on ? 'border-amber/50 bg-amber/10 text-slate-100' : 'border-ink-400 bg-ink-500 text-slate-400'
                    }`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-amber bg-amber text-ink-900' : 'border-ink-300'}`}>
                      {on && <IconCheck size={11} />}
                    </span>
                    <span className="flex-1 truncate">{h.title}</span>
                    <span className="stat-num shrink-0 text-xs text-slate-500">{aud(h.estImpact)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Surprises */}
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Any surprises I didn't flag?</div>
          <div className="grid grid-cols-[120px_1fr] gap-2.5">
            <MoneyInput value={surpriseCost !== '' ? surpriseCost : String(quote.actuals?.surpriseCost ?? '')} onChange={setSurpriseCost} placeholder="0" />
            <input
              className="input !py-2 text-sm"
              placeholder="What was it? (e.g. extra fill, broken main)"
              value={surpriseNote || quote.actuals?.surpriseNote || ''}
              onChange={(e) => setSurpriseNote(e.target.value)}
            />
          </div>
        </div>
      </div>
    </BottomSheet>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
        {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function MoneyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center rounded-xl border border-ink-400 bg-ink-500 px-2.5 focus-within:border-sage-500">
      <span className="text-slate-500">$</span>
      <input
        type="number"
        inputMode="decimal"
        className="w-full bg-transparent px-1.5 py-2 text-sm font-mono tabular-nums text-slate-100 outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
