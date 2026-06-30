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

  const addLabour = (hours: number, item: string, trigger: string, role = labourer) => {
    const p = rate.resolve({ kind: 'labour', ref: role, qty: hours, unit: 'hr', trigger })
    added.push({ item, qty: hours, unit: 'hr', cost: p.cost, charge: p.charge, trigger, kind: 'labour' })
    q.hiddenCosts.push({ item, trigger })
  }
  // Subbies/materials are priced AT COST here; Commercial applies the markup
  // (LAW 5) — Hidden Cost never invents money or margin (LAW 3).
  const addSubbie = (ref: string, qty: number, unit: string, item: string, trigger: string) => {
    const p = rate.resolve({ kind: 'subbie', ref, qty, unit, trigger })
    added.push({ item, qty: p.qty, unit, cost: p.cost, charge: p.cost, trigger, kind: 'subbie' })
    q.hiddenCosts.push({ item, trigger })
  }
  const addMaterial = (ref: string, qty: number, unit: string, item: string, trigger: string) => {
    const p = rate.resolve({ kind: 'material', ref, qty, unit, trigger })
    added.push({ item, qty: p.qty, unit, cost: p.cost, charge: p.cost, trigger, kind: 'material' })
    q.hiddenCosts.push({ item, trigger })
  }
  const addFee = (amount: number, item: string, trigger: string) => {
    added.push({ item, qty: 1, unit: 'item', cost: amount, charge: amount, trigger, kind: 'fee' })
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
  if (q.trade === 'concreting') {
    const access = q.inputs.access as string | undefined
    const vol = q.quantities.concreteVolumeM3 ?? 0
    const finish = String(q.inputs.finish ?? '')
    const isExposedAgg = q.jobType === 'exposed_aggregate_driveway' || /exposed/i.test(finish)

    // Pump needed when concrete can't be chuted/barrowed to the pour — priced
    // THROUGH the Rate service as a subbie (LAW 3), not a flat invented fee.
    if (access === 'pump' || access === 'restricted') {
      const pumpHours = Math.max(3, Math.ceil(vol / 25))
      addSubbie('Concrete Pump', pumpHours, 'hr', 'Concrete pump hire', `access=${access} → concrete pump`)
    }

    // Sub-base laying & compaction labour (the granular material itself is in Rate).
    if ((q.quantities.subBaseTonnes ?? 0) > 0) {
      const hrs = Math.max(2, round2((q.quantities.areaM2 ?? 0) / 35))
      addLabour(hrs, 'Sub-base build-up (lay & compact)', 'sub-base → lay & compact labour')
    }

    // Exposed aggregate: return visit to wash/expose & seal, sealer material,
    // and slurry washout disposal — all routinely forgotten.
    if (isExposedAgg) {
      const area = q.quantities.areaM2 ?? 0
      addLabour(Math.max(2, round2(area / 45)), 'Exposed aggregate wash & seal (return visit)', 'finish=exposed aggregate → return wash/seal', 'Concreter')
      if (area > 0) addMaterial('Aggregate Sealer', area, 'm2', 'Penetrating sealer', 'finish=exposed aggregate → sealing')
      addFee(180, 'Concrete washout & slurry disposal', 'finish=exposed aggregate → washout/slurry')
    }

    // Council crossover: inspection/permit and traffic management in the road reserve.
    if (q.jobType === 'crossover') {
      addFee(420, 'Council inspection & permit', 'crossover → council application/permit/inspection')
      if (q.inputs.trafficControl !== false) addLabour(3, 'Traffic control / spotter', 'crossover → traffic management in road reserve')
    }
  }

  // Merge into rated and recompute totals.
  q.rated.lines.push(...added)
  q.rated.costTotal = round2(q.rated.lines.reduce((s, l) => s + l.cost, 0))
  q.rated.chargeTotal = round2(q.rated.lines.reduce((s, l) => s + l.charge, 0))

  audit(q, { engine: 'HiddenCost', rule: 'detect+price', added: `${added.length} items via Rate`, result: `+$${round2(added.reduce((s, l) => s + l.charge, 0))} charge` })
  return q
}
