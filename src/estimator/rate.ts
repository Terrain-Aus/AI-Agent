// RATE ENGINE — the ONLY creator of base monetary values (LAW 3), and a
// callable SERVICE: later engines that add an item ask Rate to price it.
// Stateless: holds no data of its own, applies pricingPolicy mechanics, reads
// numbers from the supplied BI. Grosses up materials by waste/compaction here.

import type { BusinessIntelligence, DayType, Quote, RatedLine } from './types'
import { audit } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface RateQuery {
  kind: 'labour' | 'plant' | 'material' | 'subbie'
  ref: string // role / plant name / material name / subbie type
  qty: number // hours / tonnes / loads
  unit: string
  day?: DayType
  trigger: string
}

export interface RatePrice {
  item: string
  qty: number
  unit: string
  cost: number
  charge: number
  minHire?: number
  minimumCharge?: number
  float?: { required: boolean; cost: number; movements: number }
  fuel?: { included: boolean }
  applied: { roundedTo?: number; minimumApplied: boolean; recoveries: string[] }
  kind: RateQuery['kind']
  trigger: string
}

/** Build the stateless Rate service over a BI profile. */
export function makeRateService(bi: BusinessIntelligence) {
  const policy = bi.pricingPolicy

  function resolve(query: RateQuery): RatePrice {
    const recoveries: string[] = []
    let minimumApplied = false

    if (query.kind === 'labour') {
      const r = bi.labour.find((l) => l.role.toLowerCase() === query.ref.toLowerCase()) ?? bi.labour[0]
      const mult = query.day === 'saturday' ? r.saturdayMultiplier : query.day === 'sunday' ? r.sundayMultiplier : 1
      let hours = query.qty
      if (hours < r.minimumBillableHours) {
        hours = r.minimumBillableHours
        minimumApplied = true
        recoveries.push(`min ${r.minimumBillableHours}h billable`)
      }
      const charge = round2(Math.max(r.preferredSell, r.minimumSell) * mult * hours)
      const cost = round2(r.cost * mult * hours)
      return price(query, cost, charge, { minimumApplied, recoveries })
    }

    if (query.kind === 'plant') {
      const p = bi.plant.find((x) => x.name.toLowerCase() === query.ref.toLowerCase()) ?? bi.plant[0]
      let hours = Math.max(query.qty, p.minimumHireHrs)
      if (hours > query.qty) {
        minimumApplied = true
        recoveries.push(`min ${p.minimumHireHrs}h hire`)
      }
      // round machine time
      const rounded = Math.ceil(hours / policy.roundMachineTime) * policy.roundMachineTime
      let charge = round2(Math.max(p.preferredSell, p.minimumSell) * rounded)
      let cost = round2(p.cost * rounded)
      const float = p.requiresFloat ? { required: true, cost: p.floatCost, movements: 2 } : undefined
      if (float && policy.floatRecovery === 'automatic') {
        charge += round2(float.cost)
        cost += round2(float.cost)
        recoveries.push('float on/off (auto)')
      }
      // minimum charge floor
      if (charge < p.minimumCharge) {
        charge = p.minimumCharge
        minimumApplied = true
        recoveries.push(`min charge $${p.minimumCharge}`)
      }
      return { ...price(query, cost, charge, { minimumApplied, recoveries, roundedTo: policy.roundMachineTime }), float, fuel: { included: p.fuelIncluded }, minHire: p.minimumHireHrs, minimumCharge: p.minimumCharge }
    }

    if (query.kind === 'material') {
      const m = bi.materials.find((x) => x.name.toLowerCase().includes(query.ref.toLowerCase())) ?? bi.materials[0]
      // Gross up NET qty by waste / compaction allowance here (Rate's job).
      const grossFactor = 1 + (m.wastePct ?? 0) + (m.compactionAllowance ?? 0)
      const grossQty = round2(query.qty * grossFactor)
      if (grossFactor > 1) recoveries.push(`+${Math.round((grossFactor - 1) * 100)}% waste/compaction`)
      let cost = round2(grossQty * m.rate)
      if (m.regionalFreight) {
        cost = round2(cost * (1 + m.regionalFreight))
        recoveries.push(`+${Math.round(m.regionalFreight * 100)}% regional freight`)
      }
      if (m.deliveryCharge) {
        cost += m.deliveryCharge
        recoveries.push(`delivery $${m.deliveryCharge}`)
      }
      if (m.smallLoadFee && m.minimumOrder && query.qty < m.minimumOrder) {
        cost += m.smallLoadFee
        minimumApplied = true
        recoveries.push(`small-load fee $${m.smallLoadFee}`)
      }
      // Material charge = cost; markup applied later by Commercial (LAW 5).
      return { ...price({ ...query, qty: grossQty }, cost, cost, { minimumApplied, recoveries }), kind: 'material' }
    }

    // subbie
    const s = bi.subcontractors.find((x) => x.type.toLowerCase() === query.ref.toLowerCase()) ?? bi.subcontractors[0]
    const per = query.unit === 'load' ? (s.perLoad ?? 0) : query.unit === 'tonne' ? (s.perTonne ?? 0) : (s.hourly ?? 0)
    let cost = round2(per * query.qty)
    if (s.minimumCharge && cost < s.minimumCharge) {
      cost = s.minimumCharge
      minimumApplied = true
      recoveries.push(`min charge $${s.minimumCharge}`)
    }
    // Subbie charge = cost; marked up later by Commercial (LAW 5).
    return { ...price(query, cost, cost, { minimumApplied, recoveries }), kind: 'subbie' }
  }

  function price(query: RateQuery, cost: number, charge: number, applied: { minimumApplied: boolean; recoveries: string[]; roundedTo?: number }): RatePrice {
    return { item: query.ref, qty: query.qty, unit: query.unit, cost: round2(cost), charge: round2(charge), applied, kind: query.kind, trigger: query.trigger }
  }

  return { resolve }
}

export type RateService = ReturnType<typeof makeRateService>

const toLine = (p: RatePrice): RatedLine => ({ item: p.item, qty: p.qty, unit: p.unit, cost: p.cost, charge: p.charge, trigger: p.trigger, kind: p.kind })

/** RATE STAGE — price the base scope produced by Quantity. */
export function runRate(q: Quote, rate: RateService, bi: BusinessIntelligence): Quote {
  const lines: RatedLine[] = []
  const Q = q.quantities
  const day = (q.inputs.day as DayType) ?? 'weekday'

  if (Q.operatorHours && bi.labour.length) {
    lines.push(toLine(rate.resolve({ kind: 'labour', ref: 'Operator', qty: Q.operatorHours, unit: 'hr', day, trigger: 'operator for plant hours' })))
  }
  if (Q.machineHours && bi.plant.length) {
    const machineName = bi.plant.find((p) => p.type === (q.inputs.__machine as string))?.name ?? bi.plant[0].name
    lines.push(toLine(rate.resolve({ kind: 'plant', ref: machineName, qty: Q.machineHours, unit: 'hr', day, trigger: `dig ${Q.cutVolumeBankM3 ?? ''}m³ bank` })))
  }
  if (Q.roadbaseTonnes) {
    lines.push(toLine(rate.resolve({ kind: 'material', ref: 'Roadbase', qty: Q.roadbaseTonnes, unit: 'tonne', trigger: 'imported roadbase build-up' })))
  }
  if (Q.truckLoads) {
    lines.push(toLine(rate.resolve({ kind: 'subbie', ref: 'Cartage', qty: Q.truckLoads, unit: 'load', trigger: `cart ${Q.spoilLooseM3 ?? ''}m³ loose spoil` })))
  }
  if (Q.concreteVolumeM3) {
    lines.push(toLine(rate.resolve({ kind: 'material', ref: 'Concrete', qty: Q.concreteVolumeM3, unit: 'm3', trigger: 'supply concrete' })))
  }

  const costTotal = round2(lines.reduce((s, l) => s + l.cost, 0))
  const chargeTotal = round2(lines.reduce((s, l) => s + l.charge, 0))
  q.rated = { lines, costTotal, chargeTotal }
  audit(q, { engine: 'Rate', rule: 'price-base-scope', result: `cost=$${costTotal} charge=$${chargeTotal} over ${lines.length} lines` })
  return q
}
