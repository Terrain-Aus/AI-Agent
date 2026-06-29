// HIDDEN COST ENGINE — detect forgotten ITEMS by rule, emit triggers, and call
// the Rate service to price them (LAW 3 — Hidden Cost never invents money).
// NOTE: small-load fees, weekend loadings, machine float and minimum charges
// are billing rules the Rate Engine already applies — they are NOT "hidden".

import type { BusinessIntelligence, Quote, RatedLine } from './types'
import { audit } from './types'
import type { RateService } from './rate'

const round2 = (n: number) => Math.round(n * 100) / 100

export function runHiddenCost(q: Quote, rate: RateService, bi: BusinessIntelligence): Quote {
  if (!q.rated) return q
  const added: RatedLine[] = []
  const labourer = bi.labour.find((l) => /labour/i.test(l.role))?.role ?? bi.labour[0]?.role ?? 'Labourer'

  const addLabour = (hours: number, item: string, trigger: string) => {
    const p = rate.resolve({ kind: 'labour', ref: labourer, qty: hours, unit: 'hr', trigger })
    added.push({ item, qty: hours, unit: 'hr', cost: p.cost, charge: p.charge, trigger, kind: 'labour' })
    q.hiddenCosts.push({ item, trigger })
  }

  // --- ALWAYS forgotten items ---
  addLabour(1.5, 'Mobilisation (crew to site)', 'always: mobilisation')
  addLabour(1, 'Strip & site clean', 'always: strip & clean')
  addLabour(0.5, 'Site supervision', 'always: supervision')
  // Quoting & admin time — flat recovery fee.
  const quotingFee = 120
  added.push({ item: 'Quoting & admin time', qty: 1, unit: 'item', cost: quotingFee, charge: quotingFee, trigger: 'always: quoting time', kind: 'fee' })
  q.hiddenCosts.push({ item: 'Quoting & admin time', trigger: 'always: quoting time' })

  // --- conditional rule-driven items ---
  if (q.inputs.material === 'rock') {
    const machineName = bi.plant.find((p) => p.type === (q.inputs.__machine as string))?.name ?? bi.plant[0]?.name ?? 'Excavator'
    const breakerHrs = q.quantities.machineHours ?? 2
    const p = rate.resolve({ kind: 'plant', ref: machineName, qty: round2(breakerHrs * 0.5), unit: 'hr', trigger: 'material=rock → rock breaker' })
    added.push({ item: 'Rock breaker + upsized machine', qty: p.qty, unit: 'hr', cost: p.cost, charge: p.charge, trigger: 'material=rock', kind: 'plant' })
    q.hiddenCosts.push({ item: 'Rock breaker + upsized machine', trigger: 'material=rock' })
  }
  if (q.trade === 'concreting' && q.inputs.access && q.inputs.access !== 'chute') {
    // access != chute → concrete pump (priced as a subbie/fee)
    const pumpFee = 1250
    added.push({ item: 'Concrete pump hire', qty: 1, unit: 'day', cost: pumpFee, charge: round2(pumpFee * (1 + bi.pricingPolicy.subcontractMarkup)), trigger: 'access != chute → pump', kind: 'subbie' })
    q.hiddenCosts.push({ item: 'Concrete pump hire', trigger: 'access != chute → pump' })
  }
  if ((q.derived.requiresImport || q.inputs.subBase === 'none') && q.trade === 'concreting') {
    addLabour(2, 'Sub-base build-up', 'subBase=none → roadbase build-up')
  }

  // Merge into rated and recompute totals.
  q.rated.lines.push(...added)
  q.rated.costTotal = round2(q.rated.lines.reduce((s, l) => s + l.cost, 0))
  q.rated.chargeTotal = round2(q.rated.lines.reduce((s, l) => s + l.charge, 0))

  audit(q, { engine: 'HiddenCost', rule: 'detect+price', added: `${added.length} items via Rate`, result: `+$${round2(added.reduce((s, l) => s + l.charge, 0))} charge` })
  return q
}
