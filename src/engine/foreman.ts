// FOREMAN — TerrainPro's quote-review supervisor.
//
// Foreman runs on a DRAFT quote, just before the contractor exports it, and
// returns a single verdict: READY, WARN or BLOCK. It checks that the quote is
// structurally complete and commercially safe — the things a good foreman would
// catch on a desk-check before the quote leaves the truck.
//
// Hard rules (V1 is deliberately small, deterministic and testable):
//   • Foreman NEVER edits the quote.
//   • Foreman NEVER creates or looks up rates.
//   • Foreman NEVER sends, exports or approves anything — it only inspects.
//   • Foreman explains every issue in plain trade language.
//
// It is a separate lens from the Commercial Review (which hunts profit leaks):
// Foreman answers one question — "is this quote safe to send as-is?"

import type { Estimate, JobSpec } from './types'
import { resolveLocation } from './pricing'

export type ForemanStatus = 'READY' | 'WARN' | 'BLOCK'
export type ForemanSeverity = 'block' | 'warn'
export type ForemanArea = 'scope' | 'labour' | 'materials' | 'plant' | 'disposal' | 'commercial'

export interface ForemanFinding {
  code: string
  severity: ForemanSeverity
  /** Plain-trade headline. */
  title: string
  /** Plain-trade explanation of why it matters and what to do. */
  detail: string
  area: ForemanArea
}

export interface ForemanReview {
  status: ForemanStatus
  /** All findings, blockers first. */
  findings: ForemanFinding[]
  blockers: ForemanFinding[]
  warnings: ForemanFinding[]
  /** One-line plain-trade verdict. */
  summary: string
  /** The single next best action. */
  nextAction: string
  /** False only when status is BLOCK — the export gate reads this. */
  exportAllowed: boolean
}

/* ── Tunable thresholds (named, not magic numbers) ── */
const OVERHEAD_FLOOR_PCT = 10 // below this, margin isn't even carrying overheads
const LOW_MARGIN_PCT = 15 // below this, margin is thin — worth a deliberate look
const DEPOSIT_THRESHOLD = 5000 // quotes at/above this should take a deposit
const LOW_CONFIDENCE = 50 // estimator confidence below this is shaky

const CONCRETE_JOBS = ['driveway', 'slab', 'shed-slab', 'path-footpath', 'patio']
const fmt = (n: number) => '$' + Math.round(n).toLocaleString('en-AU')

const subtotal = (est: Estimate, key: string) => est.categories.find((c) => c.key === key)?.subtotal ?? 0
const itemsOf = (est: Estimate, key: string) => est.categories.find((c) => c.key === key)?.items ?? []

/**
 * Review a draft quote. Pure: same (spec, est) always returns the same verdict.
 */
export function foremanReview(spec: JobSpec, est: Estimate): ForemanReview {
  const f: ForemanFinding[] = []
  const add = (severity: ForemanSeverity, area: ForemanArea, code: string, title: string, detail: string) =>
    f.push({ severity, area, code, title, detail })

  // Mirror the estimator's own dig-depth derivation so we judge what it costed.
  const digDepth = spec.excavationDepthMm || (spec.prepRequired ? 150 : 0)
  const isConcrete = spec.trade === 'concreting' || CONCRETE_JOBS.includes(spec.jobType)
  const consumesMaterials = isConcrete || spec.jobType === 'turf' || spec.finish === 'turf' || spec.jobType === 'paving' || spec.finish === 'pavers'
  const needsDisposal = digDepth > 0 || spec.jobType === 'excavation'
  const needsPlant = spec.pumpRequired || digDepth > 0 || spec.jobType === 'excavation'

  /* ── SCOPE / MEASUREMENTS ── */
  if (spec.area <= 0) {
    add('block', 'scope', 'no-area', 'No area on the quote', "There's no square metreage entered — I can't stand behind a price with no measurement. Put the area in before this goes out.")
  }
  if (isConcrete && spec.thicknessMm <= 0) {
    add('block', 'scope', 'no-thickness', 'Concrete job, no slab thickness', "Thickness sets your concrete volume — without it there's no pour quantity and no supply cost. Add the slab depth.")
  }
  if (spec.jobType === 'other') {
    add('warn', 'scope', 'vague-scope', "Scope is vague", "Job type's set to 'other'. Double-check exactly what you're pricing before it leaves the truck.")
  }
  if (!spec.location || resolveLocation(spec.location).name === 'Unknown location') {
    add('warn', 'scope', 'location-unconfirmed', 'Site location not pinned', 'Location drives concrete freight and travel time. Pin the town or the price could be well off.')
  }

  /* ── LABOUR ── */
  if (subtotal(est, 'labour') <= 0) {
    add('block', 'labour', 'no-labour', 'No labour costed', "There's no labour in this quote — you'd be doing the work for free. Add your hours before you send it.")
  }

  /* ── MATERIALS ── */
  if (consumesMaterials && subtotal(est, 'materials') <= 0) {
    add('block', 'materials', 'no-materials', 'No materials costed', "This job needs materials but none are priced — the quote's giving the gear away. Add them in.")
  }
  const hasConcreteSupply = itemsOf(est, 'materials').some((i) => /concrete supply/i.test(i.label))
  if (isConcrete && spec.area > 0 && spec.thicknessMm > 0 && !hasConcreteSupply) {
    add('block', 'materials', 'no-concrete-supply', 'Concrete, but no concrete supply', "You've got a concrete job with no concrete in the price — the slab's free in this quote. Add the supply cost.")
  }

  /* ── PLANT / EQUIPMENT ── */
  if (needsPlant && subtotal(est, 'machinery') <= 0) {
    const why = spec.pumpRequired
      ? 'A pump is flagged but there’s no plant hire in the price.'
      : 'This job needs an excavator but no plant hire is costed.'
    add('block', 'plant', 'no-plant', 'Machine needed, none costed', `${why} Price the plant or the job runs at a loss the moment it lands on site.`)
  }

  /* ── DISPOSAL / SPOIL ── */
  if (needsDisposal && subtotal(est, 'disposal') <= 0) {
    add('block', 'disposal', 'no-disposal', 'Digging, nowhere for the spoil', "You're excavating but there's no cartage or tip fees costed. The spoil has to go somewhere — and that's billable. Add disposal.")
  }

  /* ── COMMERCIAL ── */
  if (est.marginPct <= 0) {
    add('block', 'commercial', 'no-margin', 'No margin — working for nothing', "There's no margin on this. It doesn't even cover your overheads, let alone profit. Don't send it like this.")
  } else if (est.marginPct < OVERHEAD_FLOOR_PCT) {
    add('warn', 'commercial', 'overhead-recovery', 'Barely covering overheads', `Margin's only ${est.marginPct}% — that won't carry your overheads and still leave a quid. Lift it, or know exactly why you're not.`)
  } else if (est.marginPct < LOW_MARGIN_PCT) {
    add('warn', 'commercial', 'low-margin', 'Thin margin', `Margin's ${est.marginPct}% — on the lean side. Make sure that's a deliberate call, not an accident.`)
  }
  if (est.expected > 0 && est.gst <= 0) {
    add('block', 'commercial', 'no-gst', 'Client quote with no GST', "A client-ready quote has to show GST or you'll be paying the ATO out of your own pocket. Add the GST line.")
  }
  if (est.expected >= DEPOSIT_THRESHOLD) {
    add('warn', 'commercial', 'no-deposit', 'Big job — take a deposit', `This is a ${fmt(est.expected)} job. Take a deposit before you start so you're not funding it yourself — make sure it's in your terms.`)
  }

  /* ── RISKY ASSUMPTIONS ── */
  if (spec.soil === 'unknown') {
    add('warn', 'scope', 'ground-unconfirmed', 'Ground not confirmed', "Soil's not locked in. Reactive clay or rock will blow this out — confirm it or note it as an exclusion.")
  }
  if (spec.access === 'difficult' && !spec.pumpRequired) {
    add('warn', 'plant', 'access-no-pump', 'Hard access, no pump', 'Access is difficult and there’s no pump. Barrowing concrete eats your labour — price the pump or confirm truck access.')
  }
  if (est.confidence < LOW_CONFIDENCE) {
    add('warn', 'scope', 'low-confidence', 'Low confidence on inputs', `I'm only ${est.confidence}% sure on these inputs. Tighten the scope before you commit to a fixed price.`)
  }

  const blockers = f.filter((x) => x.severity === 'block')
  const warnings = f.filter((x) => x.severity === 'warn')
  const status: ForemanStatus = blockers.length ? 'BLOCK' : warnings.length ? 'WARN' : 'READY'

  return {
    status,
    findings: [...blockers, ...warnings],
    blockers,
    warnings,
    summary: summaryFor(status, blockers.length, warnings.length),
    nextAction: nextActionFor(status, blockers, warnings.length),
    exportAllowed: status !== 'BLOCK',
  }
}

function summaryFor(status: ForemanStatus, blockers: number, warnings: number): string {
  if (status === 'BLOCK') return `Don't export yet — ${blockers} thing${blockers === 1 ? '' : 's'} on this quote must be fixed first.`
  if (status === 'WARN') return `Have a look before you export — ${warnings} thing${warnings === 1 ? '' : 's'} worth checking.`
  return 'Quote stacks up — complete, costed and safe to export.'
}

function nextActionFor(status: ForemanStatus, blockers: ForemanFinding[], warnings: number): string {
  if (status === 'BLOCK') return `Fix first: ${blockers[0].title}.`
  if (status === 'WARN') return `Review the ${warnings} warning${warnings === 1 ? '' : 's'}, then export when you're happy.`
  return 'Good to export.'
}

export const FOREMAN_LABEL: Record<ForemanStatus, string> = {
  READY: 'READY',
  WARN: 'WARN',
  BLOCK: 'BLOCKED',
}
