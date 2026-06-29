// Commercial Review — TerrainPro's signature moment.
//
// When a quote finishes, the apprentice doesn't just show a number — it gives
// a blunt commercial verdict: what you've forgotten, what it'll cost you, and
// how much profit is at risk if you send as-is. The whole point is to protect
// the contractor's margin before they hit send.

import type { Estimate, JobSpec } from './types'
import { riskSummary } from './hiddenCosts'
import { resolveLocation } from './pricing'

export type Verdict = 'send' | 'review' | 'stop'

export interface ForgottenItem {
  label: string
  /** Dollar exposure if missed (0 = qualitative check). */
  impact: number
  /** Why it matters, one blunt line. */
  note: string
  kind: 'hidden-cost' | 'unconfirmed' | 'commonly-missed'
}

export interface CommercialReview {
  verdict: Verdict
  /** Headline metrics for the profit-first panel. */
  metrics: {
    total: number
    marginPct: number
    confidence: number
    riskLevel: string
    riskTone: 'sage' | 'info' | 'amber' | 'danger'
    hiddenCount: number
    /** $ that drops out of profit if the excluded risks land. */
    potentialLoss: number
  }
  forgotten: ForgottenItem[]
  /** Profit protected by addressing the forgotten items. */
  protectedProfit: number
  /** Apprentice-voice verdict line. */
  headline: string
}

const CONCRETE_JOBS = ['driveway', 'slab', 'shed-slab', 'path-footpath', 'patio']

export function commercialReview(spec: JobSpec, est: Estimate): CommercialReview {
  const risk = riskSummary(est.hiddenCosts)
  const forgotten: ForgottenItem[] = []

  // 1. Excluded hidden costs — flagged but NOT in the price. The real leak.
  for (const h of est.hiddenCosts.filter((x) => !x.included)) {
    forgotten.push({ label: h.title, impact: h.estImpact, note: h.why, kind: 'hidden-cost' })
  }

  // 2. Unconfirmed inputs that swing the price.
  if (spec.soil === 'unknown') {
    forgotten.push({
      label: 'Ground conditions not confirmed',
      impact: 0,
      note: "You haven't locked in the soil. Reactive clay or rock changes this quote — confirm before you commit.",
      kind: 'unconfirmed',
    })
  }
  if (!spec.location || resolveLocation(spec.location).name === 'Unknown location') {
    forgotten.push({
      label: 'Site location not confirmed',
      impact: 0,
      note: 'Location drives concrete freight and travel. Pin the town before you price it.',
      kind: 'unconfirmed',
    })
  }
  if (spec.access === 'difficult' && !spec.pumpRequired) {
    forgotten.push({
      label: 'Pump hire not allowed for',
      impact: 1250,
      note: "Access is difficult but there's no pump in the price. Barrowing blows your labour out — price the pump or confirm truck access.",
      kind: 'unconfirmed',
    })
  }

  // 3. Commonly-missed line items on a concrete pour.
  const isConcrete = CONCRETE_JOBS.includes(spec.jobType) || spec.trade === 'concreting'
  if (isConcrete && spec.area > 0) {
    forgotten.push({
      label: 'Expansion / control joints',
      impact: 0,
      note: 'Confirm the joint layout — uncut slabs crack and become your warranty problem.',
      kind: 'commonly-missed',
    })
    forgotten.push({
      label: 'Concrete washout area',
      impact: 90,
      note: 'Nominate a washout area on site. Washing out where you shouldn’t is an EPA fine waiting to happen.',
      kind: 'commonly-missed',
    })
  }
  if (spec.pumpRequired) {
    forgotten.push({
      label: 'Pump clean-out / priming',
      impact: 120,
      note: 'Pump priming grout and clean-out are billable and routinely forgotten.',
      kind: 'commonly-missed',
    })
  }

  const potentialLoss = est.hiddenCosts.filter((h) => !h.included).reduce((s, h) => s + h.estImpact, 0)
  const protectedProfit = forgotten.reduce((s, f) => s + f.impact, 0)

  // Verdict: stop if the leak is material or the ground's a guess on a dig.
  const lossShare = est.expected > 0 ? potentialLoss / est.expected : 0
  const groundGuessOnDig = spec.soil === 'unknown' && (spec.prepRequired || spec.excavationDepthMm > 0)
  let verdict: Verdict = 'send'
  if (risk.level === 'Critical' || lossShare >= 0.08 || groundGuessOnDig) verdict = 'stop'
  else if (forgotten.length > 0 || risk.level === 'High' || risk.level === 'Medium') verdict = 'review'

  return {
    verdict,
    metrics: {
      total: est.expected,
      marginPct: est.marginPct,
      confidence: est.confidence,
      riskLevel: risk.level,
      riskTone: risk.tone,
      hiddenCount: est.hiddenCosts.length,
      potentialLoss,
    },
    forgotten,
    protectedProfit,
    headline: headlineFor(verdict, protectedProfit, forgotten.length),
  }
}

function headlineFor(verdict: Verdict, protectedProfit: number, count: number): string {
  const $ = '$' + Math.round(protectedProfit).toLocaleString('en-AU')
  if (verdict === 'stop') {
    return `Stop before you send this. There ${count === 1 ? 'is' : 'are'} ${count} thing${count === 1 ? '' : 's'} you haven’t locked in${protectedProfit > 0 ? `, and it’s about ${$} of your profit on the line` : ''}.`
  }
  if (verdict === 'review') {
    return `Worth a look before you send. ${count} item${count === 1 ? '' : 's'} to confirm${protectedProfit > 0 ? ` — fixing them protects roughly ${$} of profit` : ''}.`
  }
  return "Clean quote on what you've told me. Numbers stack up — good to send."
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  send: 'GOOD TO SEND',
  review: 'REVIEW',
  stop: 'STOP',
}
