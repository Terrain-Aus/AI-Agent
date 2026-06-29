// Stage 3 — CommercialEngine.  (rate, policy, risk) => CommercialResult
//
// PURE. Derives sell price from RateResult + PricingPolicy + risk inputs ONLY.
// RULE ENFORCED BY SIGNATURE: there is NO parameter for the BI rate store and
// this module imports neither ./seed nor the store — it cannot look up rates.
// (Architecture test asserts the absence of those imports.)

import type { CommercialResult, PricedLine, PricingPolicy, RateResult, RiskInputs } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

function applyRounding(value: number, policy: PricingPolicy): number {
  if (policy.rounding.mode === 'nearest' && policy.rounding.nearest > 0) {
    return Math.round(value / policy.rounding.nearest) * policy.rounding.nearest
  }
  return round2(value)
}

export function commercialEngine(rate: RateResult, policy: PricingPolicy, risk: RiskInputs): CommercialResult {
  const margin = clamp01(policy.targetMargin)

  // Margin applied on sell: sell = cost / (1 - margin).
  const pricedLines: PricedLine[] = rate.costedLines.map((l) => {
    const sell = margin < 1 ? round2(l.lineCost / (1 - margin)) : l.lineCost
    return { lineId: l.quantityLineId, cost: l.lineCost, margin: round2(sell - l.lineCost), sell }
  })

  const lineSellTotal = round2(pricedLines.reduce((s, p) => s + p.sell, 0))
  const marginTotal = round2(lineSellTotal - rate.totalCost)

  const overheadPct = risk.overheadPercentOverride ?? policy.overheadPercent
  const riskPct = risk.riskContingencyPercent ?? policy.riskContingencyDefault
  const overhead = round2(rate.totalCost * overheadPct)
  const riskContingency = round2(rate.totalCost * riskPct)

  const quotedTotal = applyRounding(lineSellTotal + overhead + riskContingency, policy)

  return { pricedLines, overhead, riskContingency, marginTotal, quotedTotal }
}

const clamp01 = (n: number) => Math.max(0, Math.min(0.95, n))
