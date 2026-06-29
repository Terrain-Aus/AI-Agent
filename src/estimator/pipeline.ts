// PIPELINE — the one-way 10-stage flow. The engine is stateless: it takes the
// raw input and a resolved BusinessIntelligence profile and returns the
// accumulated quote object. Each stage enriches; none overwrites prior fields.
//
//   Raw Input → Trade → Quantity → (BI) → Rate → Hidden Cost → Risk →
//   Commercial → Validation → Final Quote

import type { BIRepository, BusinessIntelligence, Quote, RawInput } from './types'
import { initQuote } from './types'
import { runTrade } from './trade'
import { runQuantity } from './quantity'
import { makeRateService, runRate } from './rate'
import { runHiddenCost } from './hiddenCost'
import { runRisk } from './risk'
import { runCommercial } from './commercial'
import { runValidation } from './validation'
import { runFinalQuote } from './finalQuote'

/** Run the full pipeline against a resolved BI profile. */
export function estimate(rawInput: RawInput, bi: BusinessIntelligence): Quote {
  const rate = makeRateService(bi)
  let q = initQuote(rawInput)
  q = runTrade(q)
  q = runQuantity(q, bi) // reads calibrated production rates from BI
  q = runRate(q, rate, bi) // only Rate creates base money
  q = runHiddenCost(q, rate, bi) // calls the Rate service
  q = runRisk(q, bi.pricingPolicy.allowFixedPriceBelowConfidence)
  q = runCommercial(q, bi.pricingPolicy)
  q = runValidation(q, bi.pricingPolicy)
  q = runFinalQuote(q)
  return q
}

/** Convenience: resolve the contractor profile via the repository, then run. */
export function estimateFor(rawInput: RawInput, contractorId: string, repo: BIRepository): Quote {
  return estimate(rawInput, repo.getProfile(contractorId))
}
