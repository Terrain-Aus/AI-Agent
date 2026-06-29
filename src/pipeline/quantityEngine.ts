// Stage 1 — QuantityEngine.  (ctx, productivity) => QuantityResult
//
// PURE. Converts a physical site walkthrough into physical quantities only.
// RULE ENFORCED BY TYPE: QuantityResult carries zero monetary fields, so this
// engine *cannot* emit dollars. It never sees rates.

import type {
  Productivity,
  QuantityLine,
  QuantityResult,
  QuoteContext,
  PlantHours,
} from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Default excavation machine when a scope item doesn't name one. */
const DEFAULT_MACHINE = 'ex5t'
const DEFAULT_TIP = 'cleanfill'

export function quantityEngine(ctx: QuoteContext, prod: Productivity): QuantityResult {
  const soil = ctx.site.soilType
  const lines: QuantityLine[] = []

  // 1. Bank (in-situ) excavation volume from areas×depths and explicit volumes.
  const areaDepthM3 = ctx.site.areas.reduce((sum, a) => {
    // Pair each area with the matching depth by id suffix, else the first depth.
    const depth = ctx.site.depths.find((d) => d.id === a.id) ?? ctx.site.depths[0]
    return sum + (depth ? (a.areaM2 * depth.depthMm) / 1000 : 0)
  }, 0)
  const explicitM3 = ctx.site.volumesInput.reduce((s, v) => s + v.volumeM3, 0)
  const bankM3 = round2(areaDepthM3 + explicitM3)

  // 2. Swell → loose volume (for cartage/disposal).
  const swell = prod.swellFactors[soil] ?? 1.25
  const looseM3 = round2(bankM3 * swell)

  // 3. Disposal tonnage from bank volume × in-situ density.
  const density = prod.bulkingFactors[soil] ?? 1.8
  const disposalTonnes = round2(bankM3 * density)

  // 4. Plant hours from dig productivity (per excavation scope item, else bulk).
  const digRate = prod.digRatesM3PerHr[soil] || 12
  const plantHours: PlantHours[] = []

  if (bankM3 > 0) {
    const hours = round2(bankM3 / digRate)
    plantHours.push({ machineId: DEFAULT_MACHINE, hours })
    lines.push({
      id: 'qty-excavation',
      description: `Excavate ${bankM3}m³ (${soil})`,
      quantity: hours,
      unit: 'hr',
      category: 'plant',
      machineId: DEFAULT_MACHINE,
    })
    // Cartage + disposal of spoil.
    if (disposalTonnes > 0) {
      lines.push({
        id: 'qty-disposal',
        description: `Dispose ${disposalTonnes}t spoil`,
        quantity: disposalTonnes,
        unit: 't',
        category: 'disposal',
        tipId: DEFAULT_TIP,
      })
    }
  }

  // 5. Pass through explicit scope items as physical lines (materials, labour…).
  for (const item of ctx.scopeItems) {
    if (item.quantity == null || item.unit == null) continue
    lines.push({
      id: `qty-${item.id}`,
      description: item.description,
      quantity: round2(item.quantity),
      unit: item.unit,
      category: item.category,
      machineId: item.machineId,
      materialId: item.materialId,
      roleId: item.roleId,
      tipId: item.tipId,
    })
  }

  return {
    lines,
    derived: {
      cutFillVolumes: { swellApplied: true, bankM3, looseM3 },
      disposalTonnes,
      plantHours,
    },
  }
}
