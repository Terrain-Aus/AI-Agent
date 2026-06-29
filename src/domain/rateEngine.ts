// Rate Engine — ResolveRate.
//
// R2: pure function over the projected RateBook. It NEVER imports or reads
// BusinessIntelligence; it queries finished numbers from the projection only.

import type {
  RateBook,
  RateBookEntry,
  RateBreakdown,
  RateComponent,
  RateQuery,
  RateResult,
  ResolveRate,
  ResolvedAttachment,
  ResolvedFloat,
  ResolvedFuel,
  ResolvedOperator,
} from './schema'

const round2 = (n: number) => Math.round(n * 100) / 100

function entryFor(book: RateBook, itemId: string, regionId: string): RateBookEntry | undefined {
  return (book.byItemId[itemId] ?? []).find((e) => e.regionId === regionId)
}

function breakdown(base: number, components: RateComponent[]): RateBreakdown {
  return { base: round2(base), components, subtotal: round2(base + components.reduce((s, c) => s + c.amount, 0)) }
}

export const resolveRate: ResolveRate = (book: RateBook, query: RateQuery): RateResult => {
  const notes: string[] = []
  let usedRegionalOverride = false
  const costComponents: RateComponent[] = []
  const chargeComponents: RateComponent[] = []
  const attachments: ResolvedAttachment[] = []
  let operator: ResolvedOperator | undefined
  let float: ResolvedFloat | undefined
  let fuel: ResolvedFuel | undefined
  let appliedMinimum = false
  let minimumHireHours: number | undefined

  // ---- MATERIAL ----
  if (query.materialId) {
    const e = entryFor(book, query.materialId, query.regionId)
    const q = query.quantity ?? 1
    if (!e) return empty(query, `material ${query.materialId} not in rate book for ${query.regionId}`)
    usedRegionalOverride = e.origin === 'regionalOverride'
    return {
      lineLabel: e.name,
      regionId: query.regionId,
      cost: breakdown(round2(e.cost * q), []),
      charge: breakdown(round2(e.sell * q), []),
      appliedMinimum: false,
      attachments: [],
      source: { usedRegionalOverride, appliedRegionMultiplier: 1, notes },
    }
  }

  // ---- LABOUR ----
  if (query.labourRoleId) {
    const e = entryFor(book, query.labourRoleId, query.regionId)
    const hours = query.hours ?? 1
    if (!e) return empty(query, `labour ${query.labourRoleId} not in rate book`)
    usedRegionalOverride = e.origin === 'regionalOverride'
    return {
      lineLabel: e.name,
      regionId: query.regionId,
      hours,
      cost: breakdown(round2(e.cost * hours), []),
      charge: breakdown(round2(e.sell * hours), []),
      appliedMinimum: false,
      attachments: [],
      source: { usedRegionalOverride, appliedRegionMultiplier: 1, notes },
    }
  }

  // ---- PLANT (composes operator, fuel, float, attachments) ----
  if (query.plantId) {
    const e = entryFor(book, query.plantId, query.regionId)
    if (!e || !e.plant) return empty(query, `plant ${query.plantId} not in rate book`)
    usedRegionalOverride = e.origin === 'regionalOverride'
    const detail = e.plant
    let hours = query.hours ?? 1
    minimumHireHours = detail.minimumHireHours

    // Minimum hire hours top-up.
    if (minimumHireHours != null && hours < minimumHireHours) {
      notes.push(`Applied ${minimumHireHours}h minimum hire (asked ${hours}h).`)
      hours = minimumHireHours
      appliedMinimum = true
    }

    const baseCost = round2(e.cost * hours)
    const baseCharge = round2(e.sell * hours)

    // Wet hire → add operator from the operator labour entry.
    const wet = query.requiresOperator ?? (detail.requiresOperator && e.plant.hire.default === 'wet')
    if (wet && detail.defaultOperatorRoleId) {
      const op = entryFor(book, detail.defaultOperatorRoleId, query.regionId)
      if (op) {
        const oc = round2(op.cost * hours)
        const och = round2(op.sell * hours)
        operator = { roleId: op.itemId, hours, cost: oc, charge: och }
        costComponents.push({ kind: 'operator', label: `Operator: ${op.name}`, amount: oc })
        chargeComponents.push({ kind: 'operator', label: `Operator: ${op.name}`, amount: och })
      } else {
        notes.push('Wet hire requested but operator role not found.')
      }
    }

    // Fuel.
    if (detail.fuel && detail.fuel.recoveryMode !== 'none' && detail.fuel.costPerLitre != null) {
      const litres = round2(detail.fuel.burnLitresPerHour * hours)
      const fc = round2(litres * detail.fuel.costPerLitre)
      fuel = { litres, cost: fc, charge: fc, recoveryMode: detail.fuel.recoveryMode }
      costComponents.push({ kind: 'fuel', label: 'Fuel', amount: fc })
      chargeComponents.push({ kind: 'fuel', label: 'Fuel', amount: fc })
    }

    // Float (mob/demob).
    if (detail.float && detail.float.recoveryMode !== 'none') {
      float = { cost: detail.float.cost, sell: detail.float.sell, recoveryMode: detail.float.recoveryMode }
      costComponents.push({ kind: 'float', label: 'Float on/off', amount: detail.float.cost })
      chargeComponents.push({ kind: 'float', label: 'Float on/off', amount: detail.float.sell })
    }

    // Attachments.
    for (const aId of query.attachmentIds ?? []) {
      const a = entryFor(book, aId, query.regionId)
      if (a) {
        attachments.push({ attachmentId: a.itemId, label: a.name, cost: round2(a.cost * hours), charge: round2(a.sell * hours) })
        costComponents.push({ kind: 'attachment', label: a.name, amount: round2(a.cost * hours) })
        chargeComponents.push({ kind: 'attachment', label: a.name, amount: round2(a.sell * hours) })
      }
    }

    return {
      lineLabel: e.name,
      regionId: query.regionId,
      hours,
      cost: breakdown(baseCost, costComponents),
      charge: breakdown(baseCharge, chargeComponents),
      minimumHireHours,
      appliedMinimum,
      float,
      fuel,
      attachments,
      operator,
      source: { usedRegionalOverride, appliedRegionMultiplier: 1, notes },
    }
  }

  return empty(query, 'query named no plant/labour/material')
}

function empty(query: RateQuery, note: string): RateResult {
  return {
    lineLabel: 'Unresolved',
    regionId: query.regionId,
    cost: { base: 0, components: [], subtotal: 0 },
    charge: { base: 0, components: [], subtotal: 0 },
    appliedMinimum: false,
    attachments: [],
    source: { usedRegionalOverride: false, appliedRegionMultiplier: 1, notes: [note] },
  }
}
