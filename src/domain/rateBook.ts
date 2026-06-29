// Rate-book projection — the seam between BI and the Rate Engine.
//
// Pure projection from BusinessIntelligence into a finished RateBook. The Rate
// Engine reads finished numbers from here and NEVER recomputes from BI (R2).

import type {
  BusinessIntelligence,
  Markup,
  Pricing,
  PlantItem,
  PlantRateDetail,
  ProjectRateBook,
  RateBook,
  RateBookEntry,
  Region,
  RegionalPriceOverride,
} from './schema'
import { resolveSellPrice } from './schema'

type Kind = RateBookEntry['kind']

const multiplierFor = (kind: Kind, r: Region): number => {
  switch (kind) {
    case 'labour':
      return r.modifiers.labourMultiplier
    case 'material':
      return r.modifiers.materialMultiplier
    case 'plant':
    case 'attachment':
      return r.modifiers.plantMultiplier
  }
}

const findOverride = (
  overrides: RegionalPriceOverride[],
  kind: RegionalPriceOverride['targetType'],
  itemId: string,
  regionId: string,
): RegionalPriceOverride | undefined => overrides.find((o) => o.targetType === kind && o.targetId === itemId && o.regionId === regionId)

/** Project one priced item into a region: override wins, else scale COST only. */
function projectPriced(
  itemId: string,
  kind: Kind,
  name: string,
  pricing: Pricing,
  region: Region,
  overrides: RegionalPriceOverride[],
  fallbackMarkup: Markup,
): { entry: RateBookEntry; cost: number } {
  const override = findOverride(overrides, kind, itemId, region.id)
  if (override) {
    const sell = resolveSellPrice(override.pricing, fallbackMarkup)
    return {
      entry: { itemId, kind, name, regionId: region.id, cost: override.pricing.cost, sell, minimumCharge: override.pricing.minimumCharge, origin: 'regionalOverride' },
      cost: override.pricing.cost,
    }
  }
  const cost = round2(pricing.cost * multiplierFor(kind, region))
  const scaled: Pricing = { ...pricing, cost }
  const sell = resolveSellPrice(scaled, fallbackMarkup)
  return {
    entry: { itemId, kind, name, regionId: region.id, cost, sell, minimumCharge: pricing.minimumCharge, origin: 'base' },
    cost,
  }
}

function projectPlantDetail(plant: PlantItem, region: Region, overrides: RegionalPriceOverride[], fallbackMarkup: Markup): PlantRateDetail {
  const mult = region.modifiers.plantMultiplier
  const detail: PlantRateDetail = {
    hire: plant.hire,
    requiresOperator: plant.requiresOperator,
    defaultOperatorRoleId: plant.defaultOperatorRoleId,
    minimumHireHours: plant.minimumHireHours,
    attachments: plant.attachments,
  }
  // Float — overrides target the machine hire only; sub-rates use base × multiplier.
  if (plant.float.applies && plant.float.pricing) {
    const cost = round2(plant.float.pricing.cost * mult)
    detail.float = { cost, sell: resolveSellPrice({ ...plant.float.pricing, cost }, fallbackMarkup), recoveryMode: plant.float.recoveryMode }
  }
  if (plant.standby?.applies && plant.standby.pricing) {
    const cost = round2(plant.standby.pricing.cost * mult)
    detail.standby = { cost, sell: resolveSellPrice({ ...plant.standby.pricing, cost }, fallbackMarkup) }
  }
  if (plant.fuel) {
    detail.fuel = {
      burnLitresPerHour: plant.fuel.burnLitresPerHour,
      costPerLitre: plant.fuel.costPerLitre,
      // Effective fuel recovery = fuel.recoveryMode ?? policy.fuelRecovery (applied here via fallback param caller).
      recoveryMode: plant.fuel.recoveryMode ?? 'manual',
    }
  }
  void overrides
  return detail
}

export const projectRateBook: ProjectRateBook = (bi: BusinessIntelligence): RateBook => {
  const fallbackMarkup = bi.meta.defaultTargetMarkup
  const entries: RateBookEntry[] = []

  for (const region of bi.regions) {
    for (const l of bi.labour) {
      entries.push(projectPriced(l.id, 'labour', l.name, l.pricing, region, bi.regionalOverrides, fallbackMarkup).entry)
    }
    for (const a of bi.attachments) {
      entries.push(projectPriced(a.id, 'attachment', a.name, a.pricing, region, bi.regionalOverrides, fallbackMarkup).entry)
    }
    for (const m of bi.materials) {
      entries.push(projectPriced(m.id, 'material', m.name, m.pricing, region, bi.regionalOverrides, fallbackMarkup).entry)
    }
    for (const p of bi.plant) {
      const { entry } = projectPriced(p.id, 'plant', p.name, p.pricing, region, bi.regionalOverrides, fallbackMarkup)
      // Effective fuel recovery resolves against policy when the machine inherits.
      const detail = projectPlantDetail(p, region, bi.regionalOverrides, fallbackMarkup)
      if (detail.fuel && p.fuel && p.fuel.recoveryMode == null) detail.fuel.recoveryMode = bi.pricingPolicy.fuelRecovery
      entries.push({ ...entry, plant: detail })
    }
  }

  const byItemId: Record<string, RateBookEntry[]> = {}
  for (const e of entries) {
    ;(byItemId[e.itemId] ??= []).push(e)
  }

  return { generatedFrom: bi.meta.updatedAt, entries, byItemId }
}

const round2 = (n: number) => Math.round(n * 100) / 100
