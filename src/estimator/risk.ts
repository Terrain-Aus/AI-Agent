// RISK ENGINE — score confidence from input sources + risk metadata, then set
// confidenceTier, quoteType, contingencyPct, riskFlags, assumptions[],
// variationTriggers[] and lockFixedPrice. Low confidence → more contingency and
// lock the fixed price. (Measures UNCERTAINTY; Validation checks completeness.)

import type { ConfidenceTier, Quote, QuoteType } from './types'
import { audit, isStructural } from './types'

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const round2 = (n: number) => Math.round(n * 100) / 100

export function runRisk(q: Quote, allowFixedPriceBelowConfidence: number): Quote {
  const sources = Object.values(q.inputSources)
  const base = sources.length ? sources.reduce((s, x) => s + x.confidence, 0) / sources.length : 0.5

  let confidence = base
  const flags: string[] = []
  const assumptions: string[] = []
  const variationTriggers: string[] = []

  if (!q.riskMetadata.groundConfirmed) {
    confidence -= 0.2
    flags.push('Ground type not confirmed')
    assumptions.push(`Ground assumed: ${q.inputs.material ?? 'common earth'}`)
    variationTriggers.push('Actual ground differs from assumed (e.g. rock encountered)')
  }
  if (!q.riskMetadata.siteVisit) {
    confidence -= 0.1
    assumptions.push('Priced from supplied information without a site visit')
  }
  const accessSrc = q.inputSources['access']?.source
  if (accessSrc === 'eyeballed' || accessSrc === 'unknown') {
    confidence -= 0.15
    flags.push('Access assumed, not measured')
    assumptions.push(`Access assumed: ${q.inputs.access ?? 'open'}`)
  }
  if (q.derived.producesSpoil && q.inputs.tipSite == null) {
    flags.push('Cartage indicative — tip site required')
    assumptions.push('Spoil disposal priced to nearest assumed tip; tip site to be confirmed')
    variationTriggers.push('Tip site change alters cartage')
    confidence -= 0.05
  }
  if (q.missingInputs.length > 0) {
    confidence -= 0.05 * Math.min(3, q.missingInputs.length)
  }

  // --- concreting-specific risk ---
  if (q.trade === 'concreting') {
    const finish = String(q.inputs.finish ?? '')
    if (q.jobType === 'exposed_aggregate_driveway' || /exposed/i.test(finish)) {
      flags.push('Exposed aggregate finish — wash-off, weather & batch-colour risk')
      variationTriggers.push('Aggregate exposure/colour variance or weather delay → re-finish')
      if (q.inputs.finishSampleApproved !== true) {
        confidence -= 0.05
        assumptions.push('Exposed-aggregate finish to be confirmed against an approved sample')
      }
    }
    if (q.jobType === 'crossover') {
      flags.push('Council crossover — inspection, permit & traffic management required')
      variationTriggers.push('Council rejection or road-level change at tie-in → re-pour/variation')
      assumptions.push('Council crossover permit & inspection arranged separately unless stated')
      if (q.inputs.councilApproval !== true) confidence -= 0.05
    }
    if (q.jobType === 'footings_piers') {
      flags.push('Footing/pier depth subject to engineer & founding material')
      variationTriggers.push('Rock or unstable ground in footings → depth/volume increase')
    }
    if (isStructural(q.jobType)) {
      flags.push("Structural element — engineer's design, certification & inspection required")
      variationTriggers.push("Reo/spec change from engineer's drawings → variation")
      if (q.inputs.engineerDetails !== true) {
        confidence -= 0.05
        assumptions.push("Priced to assumed structural detail; engineer's drawings & spec to be confirmed")
      }
      if (q.jobType === 'suspended_slab') {
        flags.push('Suspended slab — propping/back-prop & construction loading')
      }
    }
  }

  confidence = clamp01(round2(confidence))
  const tier: ConfidenceTier = confidence >= 0.85 ? 'high' : confidence >= 0.6 ? 'medium' : 'low'
  const contingencyPct = tier === 'high' ? 0.05 : tier === 'medium' ? 0.1 : 0.18

  // The contractor's desired quote type; default Fixed. Validation enforces the gate.
  const requested = (q.rawInput.answers.requestedQuoteType as QuoteType) ?? 'Fixed'
  const lockFixedPrice = confidence < allowFixedPriceBelowConfidence
  const quoteType: QuoteType = requested

  q.confidence = confidence
  q.confidenceTier = tier
  q.quoteType = quoteType
  q.contingencyPct = contingencyPct
  q.riskFlags = flags
  q.assumptions = assumptions
  q.variationTriggers = variationTriggers
  q.lockFixedPrice = lockFixedPrice

  audit(q, { engine: 'Risk', rule: 'score', result: `confidence=${confidence} tier=${tier} contingency=${Math.round(contingencyPct * 100)}% lockFixed=${lockFixedPrice}` })
  return q
}
