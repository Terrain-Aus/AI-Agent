// Stage 4 — ValidationEngine.  (commercial, quantity, history, policy) => ValidationResult
//
// PURE. The digital apprentice: the final gate before a quote can be sent.
// Catches errors that cost the contractor money. Per the locked signature it
// receives NO rate store — plausibility is judged against jobHistory benchmarks
// and the quote's own implied unit economics.

import type {
  CommercialResult,
  PastJob,
  PricingPolicy,
  QuantityResult,
  ValidationCheck,
  ValidationResult,
  ValidationStatus,
} from './types'

export function validationEngine(
  commercial: CommercialResult,
  quantity: QuantityResult,
  history: PastJob[],
  policy: PricingPolicy,
): ValidationResult {
  const checks: ValidationCheck[] = []

  // --- marginBelowFloor -> FAIL ---
  const effectiveMargin = commercial.quotedTotal > 0 ? commercial.marginTotal / commercial.quotedTotal : 0
  if (effectiveMargin < policy.marginFloor) {
    checks.push({
      rule: 'marginBelowFloor',
      severity: 'fail',
      message: `Margin ${(effectiveMargin * 100).toFixed(1)}% is below your floor of ${(policy.marginFloor * 100).toFixed(0)}%. This quote loses you money — do not send.`,
    })
  }

  // --- belowMinimumQuoteValue -> WARN ---
  if (commercial.quotedTotal < policy.minimumQuoteValue) {
    checks.push({
      rule: 'belowMinimumQuoteValue',
      severity: 'warn',
      message: `Quote ${money(commercial.quotedTotal)} is under your minimum job value of ${money(policy.minimumQuoteValue)}.`,
    })
  }

  // --- zeroQuantityLine / lineBelowPlausibleUnitRate -> WARN/FAIL ---
  const costByLine = new Map(commercial.pricedLines.map((p) => [p.lineId, p.cost]))
  for (const line of quantity.lines) {
    if (line.quantity <= 0) {
      checks.push({ rule: 'zeroQuantityLine', severity: 'warn', message: `"${line.description}" has zero quantity.`, lineId: line.id })
      continue
    }
    const cost = costByLine.get(line.id) ?? 0
    if (cost <= 0) {
      checks.push({
        rule: 'lineBelowPlausibleUnitRate',
        severity: 'warn',
        message: `"${line.description}" priced at $0 — no rate matched. Add the rate in Business Intelligence.`,
        lineId: line.id,
      })
    }
  }

  // --- missing physical scope items -> WARN ---
  const categories = new Set(quantity.lines.map((l) => l.category))
  const hasDig = quantity.derived.cutFillVolumes.bankM3 > 0
  if (hasDig && !categories.has('mobilisation')) {
    checks.push({ rule: 'missingMobilisation', severity: 'warn', message: "No mobilisation/float line. You'll wear the cost of getting plant to site." })
  }
  if (hasDig && !categories.has('traffic-control') && !categories.has('survey-setout')) {
    // Surface both as a single nudge when neither is present on a dig job.
    checks.push({ rule: 'missingTrafficControl', severity: 'warn', message: 'No traffic control allowed for. Required if you’re working on or near a road reserve.' })
    checks.push({ rule: 'missingSurveySetout', severity: 'warn', message: 'No survey/set-out line. Levels and set-out are billable and easy to forget.' })
  }

  // --- totalDeviatesFromHistory ($/m³ vs benchmark) -> WARN ---
  const bankM3 = quantity.derived.cutFillVolumes.bankM3
  if (bankM3 > 0 && history.length > 0) {
    const sellPerM3 = commercial.quotedTotal / bankM3
    const benchmark = median(history.map((h) => h.costPerM3))
    if (benchmark > 0) {
      const deviation = (sellPerM3 - benchmark) / benchmark
      if (Math.abs(deviation) >= 0.4) {
        checks.push({
          rule: 'totalDeviatesFromHistory',
          severity: 'warn',
          message: `At ${money(sellPerM3)}/m³ this is ${deviation > 0 ? 'well above' : 'well below'} your usual ${money(benchmark)}/m³. Double-check the take-off.`,
        })
      }
    }
  }

  return { status: rollup(checks), checks }
}

/** UI gate helper — nothing leaves on a fail. */
export function canSend(result: ValidationResult): boolean {
  return result.status !== 'fail'
}

function rollup(checks: ValidationCheck[]): ValidationStatus {
  if (checks.some((c) => c.severity === 'fail')) return 'fail'
  if (checks.some((c) => c.severity === 'warn')) return 'warn'
  return 'pass'
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-AU')
