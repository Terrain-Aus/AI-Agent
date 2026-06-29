// Validation Engine — RunValidation + BuildFinalQuote.
//
// The digital apprentice: the final gate before a quote can leave. Block by
// default; only an explicit, recorded override may send against advice.
// R4: BuildFinalQuote accepts a ValidatedQuoteContext — it cannot be called
// without a ValidationResult present.

import type {
  BuildFinalQuote,
  FinalLineItem,
  FinalQuote,
  PricingPolicy,
  QuoteContext,
  RunValidation,
  ValidatedQuoteContext,
  ValidationCheck,
  ValidationRecommendation,
  ValidationResult,
} from './schema'

export const runValidation: RunValidation = (ctx: QuoteContext, policy: PricingPolicy): ValidationResult => {
  const checks: ValidationCheck[] = []

  // Completeness of the assembled pipeline.
  if (!ctx.trade) checks.push({ code: 'missingTrade', severity: 'blocking', message: 'Trade not detected.', remediationStage: 'quantity', autoFixable: false })
  if (!ctx.quantities || ctx.quantities.items.length === 0) checks.push({ code: 'missingQuantities', severity: 'blocking', message: 'No quantities — capture the site geometry.', remediationStage: 'quantity', autoFixable: false })
  if (!ctx.rates || ctx.rates.length === 0) checks.push({ code: 'missingRates', severity: 'blocking', message: 'Nothing priced yet.', remediationStage: 'rate', autoFixable: false })
  if (!ctx.commercial) checks.push({ code: 'missingCommercial', severity: 'blocking', message: 'Commercials not run.', remediationStage: 'commercial', autoFixable: false })

  const c = ctx.commercial
  if (c) {
    // Margin floor — negative margin blocks unless policy allows.
    if (c.achievedMargin < 0 && !policy.allowNegativeMargin) {
      checks.push({ code: 'negativeMargin', severity: 'blocking', message: `Margin is ${(c.achievedMargin * 100).toFixed(1)}% — this loses money. Blocked.`, remediationStage: 'commercial', autoFixable: false })
    } else if (c.achievedMargin < 0.1) {
      checks.push({ code: 'thinMargin', severity: 'warning', message: `Margin is only ${(c.achievedMargin * 100).toFixed(1)}%.`, remediationStage: 'commercial', autoFixable: false })
    }
    // Minimum job value.
    if (c.total < policy.minimumJobValue) {
      checks.push({ code: 'belowMinimumJobValue', severity: 'warning', message: `Total ${money(c.total)} is under your minimum job value ${money(policy.minimumJobValue)}.`, remediationStage: 'commercial', autoFixable: true })
    }
  }

  // Input certainty below the fixed-price threshold → recommend a site visit.
  const lowConfidence = ctx.risk != null && ctx.risk.confidence < policy.allowFixedPriceBelowConfidence
  if (lowConfidence) {
    checks.push({ code: 'lowInputConfidence', severity: 'warning', message: 'Input certainty is low for a fixed price. Consider a site visit.', remediationStage: 'quantity', autoFixable: false })
  }

  const blockingCount = checks.filter((x) => x.severity === 'blocking').length
  const warnCount = checks.filter((x) => x.severity === 'warning').length
  const recommendation: ValidationRecommendation = blockingCount > 0 ? 'block_send' : lowConfidence ? 'site_visit_required' : warnCount > 0 ? 'review' : 'send'

  // Completeness confidence: how assembled + certain the context is.
  const stages = [ctx.trade, ctx.quantities, ctx.rates, ctx.commercial].filter(Boolean).length
  const completenessConfidence = Math.round(((stages / 4) * 0.7 + (ctx.risk?.confidence ?? 0.5) * 0.3) * 100) / 100

  return {
    completenessConfidence,
    checks,
    blockingCount,
    recommendation,
    decision: { gate: blockingCount > 0 ? 'block' : 'allow', overridden: false },
  }
}

export const buildFinalQuote: BuildFinalQuote = (ctx: ValidatedQuoteContext): FinalQuote => {
  const lineItems: FinalLineItem[] = (ctx.rates ?? []).map((r) => ({
    label: r.result.lineLabel,
    quantity: r.result.hours ?? r.query.quantity,
    unit: r.result.hours != null ? 'hr' : undefined,
    charge: r.result.charge.subtotal,
  }))
  const total = ctx.commercial?.total ?? lineItems.reduce((s, l) => s + l.charge, 0)
  const d = ctx.validation.decision
  return {
    total: round2(total),
    lineItems,
    generatedAt: ctx.createdAt,
    // sentAgainstAdvice mirrors an override of a blocking gate.
    sentAgainstAdvice: d.overridden && d.gate === 'block',
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-AU')
