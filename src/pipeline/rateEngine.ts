// Stage 2 — RateEngine.  (quantity, rates) => RateResult
//
// PURE & STATELESS. Rates are passed in as an argument; this module persists
// nothing and holds no rate store of its own. It costs physical quantities at
// the supplied rates (COST, pre-margin) and records the exact rates it used.

import type {
  QuantityLine,
  QuantityResult,
  RateResult,
  RateSnapshotEntry,
  Rates,
  Unit,
} from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

interface Resolved {
  unitRate: number
  kind: RateSnapshotEntry['kind']
  refId: string
}

/** Resolve the unit COST rate for a physical line from the supplied rates. */
function resolveRate(line: QuantityLine, rates: Rates): Resolved {
  switch (line.category) {
    case 'plant':
    case 'excavation':
    case 'mobilisation': {
      const id = line.machineId ?? 'ex5t'
      const r = rates.plantRates[id]
      if (r) return { unitRate: r.hourlyCost, kind: 'plant', refId: id }
      break
    }
    case 'labour':
    case 'traffic-control':
    case 'survey-setout': {
      const id = line.roleId ?? 'labourer'
      const r = rates.labourRates[id]
      if (r) return { unitRate: r.costPerHour, kind: 'labour', refId: id }
      break
    }
    case 'disposal': {
      const id = line.tipId ?? 'cleanfill'
      const r = rates.disposalRates[id]
      if (r) return { unitRate: r.perTonne, kind: 'disposal', refId: id }
      break
    }
    case 'cartage': {
      // Cartage costed against tipper plant time if referenced, else fallback.
      const id = line.machineId ?? 'tipper'
      const r = rates.plantRates[id]
      if (r) return { unitRate: r.hourlyCost, kind: 'plant', refId: id }
      break
    }
    case 'concrete':
    case 'reo':
    case 'paving':
    case 'drainage':
    case 'prep':
    case 'other': {
      if (line.materialId) {
        const r = rates.materialRates[line.materialId]
        if (r) return { unitRate: r.costRate, kind: 'material', refId: line.materialId }
      }
      break
    }
    default:
      break
  }
  // No rate found — record as fallback at zero so Validation can flag it.
  return { unitRate: 0, kind: 'fallback', refId: line.materialId ?? line.machineId ?? line.roleId ?? line.tipId ?? line.category }
}

export function rateEngine(quantity: QuantityResult, rates: Rates): RateResult {
  const costedLines = quantity.lines.map((line) => {
    const { unitRate } = resolveRate(line, rates)
    return {
      quantityLineId: line.id,
      quantity: line.quantity,
      unit: line.unit as Unit,
      unitRate,
      lineCost: round2(line.quantity * unitRate),
    }
  })

  const rateSnapshot: RateSnapshotEntry[] = quantity.lines.map((line) => {
    const { unitRate, kind, refId } = resolveRate(line, rates)
    return { kind, refId, unitRate, unit: line.unit }
  })

  const totalCost = round2(costedLines.reduce((s, l) => s + l.lineCost, 0))
  return { costedLines, totalCost, rateSnapshot }
}
