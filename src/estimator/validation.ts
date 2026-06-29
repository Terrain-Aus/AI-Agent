// VALIDATION ENGINE — the gate. Distinct from Risk: Risk measures uncertainty,
// Validation checks COMPLETENESS + SANITY against pricingPolicy. A single BLOCK
// stops the quote leaving (LAW 6).

import type { PricingPolicy, Quote, ValidationFinding, ValidationStatus } from './types'
import { audit } from './types'
import { TRUCK_CAPACITY_M3 } from './seed'

export function runValidation(q: Quote, policy: PricingPolicy): Quote {
  const findings: ValidationFinding[] = []
  const confidence = q.confidence ?? 0.5

  /* ── COMPLETENESS ── */
  if (q.missingInputs.length > 0) {
    findings.push({ severity: 'warn', check: 'requiredInputs', detail: `Missing inputs: ${q.missingInputs.join(', ')}` })
  }
  if (q.derived.servicesCritical && !q.riskMetadata.servicesLocated) {
    findings.push({ severity: 'block', check: 'servicesLocated', detail: 'Services not located on a services-critical job. Locate before quoting.' })
  }
  if (q.derived.producesSpoil && q.inputs.cartageRequired !== false && (q.quantities.truckLoads ?? 0) === 0 && q.inputs.spoilDestination === 'offsite') {
    findings.push({ severity: 'block', check: 'spoilNoCartage', detail: 'Job produces spoil for offsite disposal but no truck loads were costed.' })
  }

  /* ── PLAUSIBILITY ── */
  const bank = q.quantities.cutVolumeBankM3 ?? 0
  const hrs = q.quantities.machineHours ?? 0
  if (bank > 0 && hrs > 0) {
    const impliedRate = bank / hrs
    if (impliedRate > 130) findings.push({ severity: 'warn', check: 'hoursLow', detail: `Implied ${impliedRate.toFixed(0)} m³/hr looks high — machine hours may be low.` })
    if (impliedRate < 1.5) findings.push({ severity: 'warn', check: 'hoursHigh', detail: `Implied ${impliedRate.toFixed(1)} m³/hr looks low — machine hours may be high.` })
  }
  if (q.quantities.spoilLooseM3 != null && q.quantities.truckLoads != null) {
    const expected = Math.ceil(q.quantities.spoilLooseM3 / TRUCK_CAPACITY_M3)
    if (q.quantities.truckLoads !== expected) {
      findings.push({ severity: 'warn', check: 'truckLoads', detail: `Why ${q.quantities.truckLoads} loads? Expected ${expected} for ${q.quantities.spoilLooseM3}m³ loose.` })
    }
  }
  if (q.derived.requiresImport && !(q.quantities.roadbaseTonnes && q.quantities.roadbaseTonnes > 0)) {
    findings.push({ severity: 'warn', check: 'importMissing', detail: 'Job requires imported material but no import quantity was computed.' })
  }

  /* ── POLICY GATES ── */
  const c = q.commercial
  if (c) {
    if (c.realisedMargin < 0 && !policy.allowNegativeMargin) {
      findings.push({ severity: 'block', check: 'negativeMargin', detail: `Margin ${(c.realisedMargin * 100).toFixed(1)}% is negative — this loses money.` })
    } else if (c.realisedMargin < c.marginPct) {
      findings.push({ severity: 'warn', check: 'belowTargetMargin', detail: `Margin ${(c.realisedMargin * 100).toFixed(1)}% is below target ${(c.marginPct * 100).toFixed(0)}%.` })
    }
    if (c.totalIncGst < policy.minimumJobValue) {
      findings.push({ severity: 'warn', check: 'belowMinimumJobValue', detail: `Total under minimum job value $${policy.minimumJobValue}.` })
    }
  }

  // Fixed price requires sufficient confidence — else BLOCK fixed, downgrade.
  let recommendation = 'Send'
  if (q.quoteType === 'Fixed' && confidence < policy.allowFixedPriceBelowConfidence) {
    findings.push({
      severity: 'block',
      check: 'fixedPriceConfidence',
      detail: `Confidence ${(confidence * 100).toFixed(0)}% is below the ${(policy.allowFixedPriceBelowConfidence * 100).toFixed(0)}% needed for a FIXED price.`,
    })
    q.quoteType = 'Estimate' // downgrade
    recommendation = 'Site visit required before a firm price — issued as an indicative estimate.'
  }

  const blockSend = findings.some((f) => f.severity === 'block')
  const status: ValidationStatus = blockSend ? 'BLOCK' : findings.some((f) => f.severity === 'warn') ? 'WARN' : 'PASS'
  if (status === 'PASS') recommendation = 'Send'
  else if (status === 'WARN' && recommendation === 'Send') recommendation = 'Review the warnings before sending.'

  q.validation = { status, confidence, findings, recommendation, blockSend }
  audit(q, { engine: 'Validation', rule: 'completeness+plausibility+policy', result: `status=${status} block=${blockSend} findings=${findings.length}` })
  return q
}
