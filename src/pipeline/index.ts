// TerrainPro quoting pipeline — one-way runner.
//
// QuoteContext --Quantity--> RateResult --Rate--> CommercialResult --> Validation
// No stage reaches around the pipeline; each emits its own immutable result.
// UI calls runPipeline; engines never call UI.

import type {
  BusinessIntelligence,
  CommercialResult,
  QuantityResult,
  QuoteContext,
  RateResult,
  RiskInputs,
  ScopeItem,
  ValidationResult,
} from './types'
import { quantityEngine } from './quantityEngine'
import { rateEngine } from './rateEngine'
import { commercialEngine } from './commercialEngine'
import { validationEngine, canSend } from './validationEngine'

export interface PipelineResult {
  quantity: QuantityResult
  rate: RateResult
  commercial: CommercialResult
  validation: ValidationResult
}

/** Run the full one-way pipeline against BusinessIntelligence + risk inputs. */
export function runPipeline(ctx: QuoteContext, bi: BusinessIntelligence, risk: RiskInputs = {}): PipelineResult {
  const quantity = quantityEngine(ctx, bi.productivity)
  const rate = rateEngine(quantity, bi.rates)
  const commercial = commercialEngine(rate, bi.pricingPolicy, risk)
  const validation = validationEngine(commercial, quantity, bi.jobHistory, bi.pricingPolicy)
  return { quantity, rate, commercial, validation }
}

/**
 * Forgotten physical items detected on the Hidden Cost + Risk screen re-enter
 * the pipeline at STAGE 1 (Quantity) so they flow Quantity → Rate → Commercial
 * correctly. Returns a NEW QuoteContext; the caller re-runs runPipeline.
 */
export function addForgottenScopeItems(ctx: QuoteContext, items: ScopeItem[]): QuoteContext {
  return { ...ctx, scopeItems: [...ctx.scopeItems, ...items] }
}

export { quantityEngine, rateEngine, commercialEngine, validationEngine, canSend }
export * from './types'
export { SEED_BUSINESS_INTELLIGENCE } from './seed'
