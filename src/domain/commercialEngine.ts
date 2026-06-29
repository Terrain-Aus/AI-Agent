// Commercial Engine — RunCommercial.
//
// R3: handed a RateResult, the PricingPolicy and the RiskAssessment — NEVER the
// BusinessIntelligence or the RateBook. It cannot look up a rate. It owns risk
// loading and hidden-cost recovery.

import type {
  CommercialAdjustment,
  CommercialResult,
  HiddenCostItem,
  PricingPolicy,
  RateResult,
  RiskAssessment,
  RunCommercial,
} from './schema'
import { resolveMargin } from './schema'

const round2 = (n: number) => Math.round(n * 100) / 100

export const runCommercial: RunCommercial = (rates: RateResult, policy: PricingPolicy, risk: RiskAssessment): CommercialResult => {
  const subtotalCost = rates.cost.subtotal
  const subtotalCharge = rates.charge.subtotal

  // Hidden costs surface from cost components whose recovery isn't automatic.
  const hiddenItems: HiddenCostItem[] = []
  if (rates.float) {
    hiddenItems.push({ code: 'float', label: 'Float on/off', cost: rates.float.cost, recoveryMode: rates.float.recoveryMode, recovered: rates.float.recoveryMode === 'automatic' })
  }
  if (rates.fuel) {
    hiddenItems.push({ code: 'fuel', label: 'Fuel burn', cost: rates.fuel.cost, recoveryMode: rates.fuel.recoveryMode, recovered: rates.fuel.recoveryMode === 'automatic' })
  }
  const unrecovered = hiddenItems.filter((h) => !h.recovered).reduce((s, h) => s + h.cost, 0)
  const hiddenCosts = { items: hiddenItems, total: round2(unrecovered) }

  // Adjustments: risk contingency, recovery of unrecovered hidden cost, rounding.
  const adjustments: CommercialAdjustment[] = []
  const contingency = round2(subtotalCharge * risk.contingencyMarkup)
  if (contingency !== 0) adjustments.push({ label: `Risk contingency (${Math.round(risk.contingencyMarkup * 100)}%)`, amount: contingency, kind: 'contingency' })
  if (unrecovered > 0) adjustments.push({ label: 'Recover hidden costs', amount: round2(unrecovered), kind: 'uplift' })

  const preRounding = subtotalCharge + contingency + unrecovered
  const rounded = Math.round(preRounding)
  const roundingDelta = round2(rounded - preRounding)
  if (roundingDelta !== 0) adjustments.push({ label: 'Rounding', amount: roundingDelta, kind: 'rounding' })

  // Enforce minimum job value as an uplift (policy floor).
  let total = rounded
  if (total < policy.minimumJobValue) {
    adjustments.push({ label: 'Minimum job value top-up', amount: round2(policy.minimumJobValue - total), kind: 'uplift' })
    total = policy.minimumJobValue
  }

  const appliedMarkup = subtotalCost > 0 ? round4((subtotalCharge - subtotalCost) / subtotalCost) : 0
  const achievedMargin = round4(resolveMargin(subtotalCost, total))

  return {
    subtotalCost: round2(subtotalCost),
    subtotalCharge: round2(subtotalCharge),
    appliedMarkup,
    achievedMargin,
    hiddenCosts,
    adjustments,
    total: round2(total),
  }
}

const round4 = (n: number) => Math.round(n * 10000) / 10000
