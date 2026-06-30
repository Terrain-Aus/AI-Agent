// Foreman — TerrainPro's quote review supervisor (V1).
//
// Where the AI Apprentice BUILDS the quote and the Commercial Review (review.ts)
// protects the contractor's MARGIN, the Foreman is the last set of eyes before a
// quote leaves the door. It reads a finished draft and gives one blunt verdict —
// READY, WARN or BLOCK — backed by specific, plain-trade reasons.
//
// Foreman V1 is a fully DETERMINISTIC, rule-based reviewer: same quote in → same
// verdict out. No LLM, no network, no randomness. It sits on this seam:
//
//   AI Apprentice / Quote Builder
//     → Hidden Cost / Risk / Commercial checks
//       → FOREMAN REVIEW  (this module)
//         → Client Quote Preview / Export
//
// Hard rules (by design — enforced by what this module does NOT do):
//   • Foreman never edits the quote — it only reports.
//   • Foreman never creates or invents rates.
//   • Foreman never sends, exports or approves anything automatically.
//   • Foreman explains every issue in plain trade language.
// The only "gate" power it has is advisory: on BLOCK the UI holds the export
// button, but the contractor is always the one who acts.

import type { Estimate, Quote } from './types'
import { resolveLocation } from './pricing'

/* ───────────────────────── Public shape ───────────────────────── */

export type ForemanStatus = 'READY' | 'WARN' | 'BLOCK'
export type ForemanSeverity = 'block' | 'warn' | 'info'
/** Which part of the quote an issue belongs to (handy for grouping/filtering). */
export type ForemanArea = 'scope' | 'labour' | 'materials' | 'plant' | 'disposal' | 'commercial'

/** A single thing Foreman wants the contractor to look at. */
export interface ForemanIssue {
  /** Stable id for the check (handy for tests / analytics). */
  id: string
  severity: ForemanSeverity
  /** The part of the quote this issue sits in. */
  area: ForemanArea
  /** Short label shown on the row. */
  title: string
  /** Plain-trade explanation of why it matters. */
  detail: string
  /** What to do about it — Foreman suggests, never does it. */
  fix: string
}

export interface ForemanReport {
  status: ForemanStatus
  /** One-line plain-language verdict. */
  summary: string
  /** Every issue, most severe first. */
  issues: ForemanIssue[]
  blockers: ForemanIssue[]
  warnings: ForemanIssue[]
  advisories: ForemanIssue[]
  /** The single best next step for the contractor. */
  nextAction: string
  /**
   * Whether the export/preview gate should let the quote through. False only on
   * BLOCK. Foreman never exports itself — this just tells the gate to hold.
   */
  canExport: boolean
}

/** Tunable context. All optional so the reviewer stays a pure, easy-to-test fn. */
export interface ForemanContext {
  /** Is the contractor's Business profile set up (real rates vs starter rates)? */
  businessConfigured?: boolean
  /** Margin % at/under which Foreman warns. */
  lowMarginPct?: number
  /** Quote total (inc GST) at/above which a deposit is expected. */
  depositThreshold?: number
  /** Confidence % under which Foreman flags shaky assumptions. */
  lowConfidencePct?: number
}

export const LOW_MARGIN_PCT = 10
export const DEPOSIT_THRESHOLD = 15000
export const LOW_CONFIDENCE_PCT = 60

const SEVERITY_RANK: Record<ForemanSeverity, number> = { block: 0, warn: 1, info: 2 }

const CONCRETE_JOBS = ['driveway', 'slab', 'shed-slab', 'path-footpath', 'patio']

/* ───────────────────────── Entry point ───────────────────────── */

/**
 * Review a draft quote. Pure: given the same spec/estimate/context it always
 * returns the same report.
 */
export function foremanReview(
  quote: Pick<Quote, 'spec' | 'estimate'>,
  ctx: ForemanContext = {},
): ForemanReport {
  const { spec, estimate: est } = quote
  const lowMargin = ctx.lowMarginPct ?? LOW_MARGIN_PCT
  const depositThreshold = ctx.depositThreshold ?? DEPOSIT_THRESHOLD
  const lowConfidence = ctx.lowConfidencePct ?? LOW_CONFIDENCE_PCT

  // Nothing to review until the apprentice has priced it.
  if (!est) {
    return assemble([
      issue('not-priced', 'block', 'scope', 'Quote not priced yet', "There's no estimate on this quote, so there's nothing for me to check. Price it first.", 'Ask the Apprentice to price the job, then bring it back to me.'),
    ])
  }

  const issues: ForemanIssue[] = []
  const area = spec.area
  const text = `${spec.rawDescription} ${spec.notes}`.toLowerCase()

  const subtotal = (key: Estimate['categories'][number]['key']) =>
    est.categories.find((c) => c.key === key)?.subtotal ?? 0
  const items = (key: Estimate['categories'][number]['key']) =>
    est.categories.find((c) => c.key === key)?.items ?? []

  const labourTotal = subtotal('labour')
  const materialsTotal = subtotal('materials')
  const machineryTotal = subtotal('machinery')
  const disposalTotal = subtotal('disposal')

  const isConcrete = spec.trade === 'concreting' || CONCRETE_JOBS.includes(spec.jobType)
  const expectsConcrete = isConcrete && area > 0 && spec.thicknessMm > 0
  const expectsMaterials = isConcrete || spec.jobType === 'turf' || spec.jobType === 'paving' || spec.finish === 'turf' || spec.finish === 'pavers'

  const digDepth = spec.excavationDepthMm > 0 ? spec.excavationDepthMm : spec.prepRequired ? 150 : 0
  const digHappening = digDepth > 0 || spec.jobType === 'excavation'
  const producesSpoil = (digDepth > 0 && area > 0) || spec.jobType === 'excavation'
  const textMentionsRemoval = /\bdemolit|\bexcavat|\bremov|\bdig\b|\bspoil|\bcart\b|\bstrip\b/.test(text)

  /* ── Measurements & scope (BLOCK if unpriceable) ──────────────── */
  if (area <= 0) {
    issues.push(issue('no-area', 'block', 'scope', 'No area / measurement', "There's no area on this job. Without a measured quantity the whole price is a guess.", 'Add the m² (or the measured quantity) on the Job tab and re-price.'))
  }
  if (isConcrete && area > 0 && spec.thicknessMm <= 0) {
    issues.push(issue('no-thickness', 'warn', 'scope', 'No slab thickness', "You've got a concrete job with no thickness set. Thickness drives concrete volume — the biggest single cost on the pour.", 'Set the slab/pour thickness (mm) on the Job tab.'))
  }
  if (spec.jobType === 'other') {
    issues.push(issue('vague-scope', 'warn', 'scope', 'Scope is vague', "Job type is set to 'other', so I can't sanity-check what's actually being priced. Pin down exactly what this job is before it leaves the truck.", 'Set a specific job type on the Job tab, or spell the scope out in the notes.'))
  }

  /* ── Labour ───────────────────────────────────────────────────── */
  if (est.baseCost > 0 && labourTotal <= 0) {
    issues.push(issue('no-labour', 'block', 'labour', 'No labour in the quote', "There's no labour costed on this job. Materials don't lay themselves — if the crew isn't in the price, you're paying their wages out of your margin.", 'Add the crew (prep, lay & finish, etc.) on the Job tab, or confirm this is supply-only.'))
  }

  /* ── Materials ────────────────────────────────────────────────── */
  if (expectsMaterials && materialsTotal <= 0) {
    issues.push(issue('no-materials', 'block', 'materials', 'No materials costed', `This is a ${spec.jobType.replace('-', ' ')} job but there are no materials in the price. The supply has to be in here somewhere.`, 'Check the materials on the Job tab and re-price.'))
  }

  /* ── Concrete with no concrete supply ─────────────────────────── */
  if (expectsConcrete && !items('materials').some((i) => /concrete/i.test(i.label))) {
    issues.push(issue('concrete-no-supply', 'block', 'materials', 'Concrete job, no concrete supply', "You're pouring concrete but I can't see a concrete supply cost. That's the single biggest line on the job — leaving it out guts your price.", 'Confirm the concrete supply is costed (volume × $/m³) and re-price.'))
  }

  /* ── Excavation / removal with no disposal or spoil handling ──── */
  if (producesSpoil && disposalTotal <= 0) {
    const sev: ForemanSeverity = spec.jobType === 'excavation' ? 'block' : 'warn'
    issues.push(issue('dig-no-disposal', sev, 'disposal', 'Spoil with nowhere to go', "You're digging but there's no disposal or spoil handling in the price. That dirt has to be carted and tipped — or noted as cut-to-fill staying on site.", 'Add spoil cartage + tipping fees, or note on the quote that spoil stays on site.'))
  } else if (!producesSpoil && textMentionsRemoval && disposalTotal <= 0) {
    issues.push(issue('removal-text-no-disposal', 'warn', 'disposal', 'Removal mentioned, no disposal', "The job notes mention excavation/demolition/removal, but there's no disposal in the price. Make sure the spoil or rubbish is handled.", 'Add disposal/cartage if material is leaving site, or clarify the scope.'))
  }

  /* ── Plant / equipment where required ─────────────────────────── */
  if (digHappening && machineryTotal <= 0) {
    issues.push(issue('dig-no-plant', 'block', 'plant', 'Digging with no plant', "There's excavation on this job but no machinery in the price. Hand-digging a job like this isn't real — the excavator/bobcat needs to be costed.", 'Add the plant (excavator/bobcat + operator) on the Job tab and re-price.'))
  }
  if (spec.pumpRequired && !items('machinery').some((i) => /pump/i.test(i.label))) {
    issues.push(issue('pump-not-costed', 'warn', 'plant', 'Pump flagged, not costed', "You've marked this job as needing a concrete pump, but there's no pump in the price. Pump hire is a real day rate — don't wear it yourself.", 'Add the concrete pump hire, or clear the pump flag if access can chute.'))
  }

  /* ── GST on a client-ready quote ──────────────────────────────── */
  if (est.expected > 0 && est.gst <= 0) {
    issues.push(issue('no-gst', 'block', 'commercial', 'No GST on the quote', "The client-facing total has no GST on it. If you're registered, the price that goes out must include GST or you're 10% short on every job.", 'Confirm GST is applied before this goes to the client.'))
  }

  /* ── Margin ───────────────────────────────────────────────────── */
  if (est.marginPct <= 0) {
    issues.push(issue('zero-margin', 'block', 'commercial', 'No margin', "There's no profit margin on this quote — you'd be working for cost. One thing goes wrong and you're paying to do the job.", 'Set a margin on the Costs tab before this goes out.'))
  } else if (est.marginPct < lowMargin) {
    issues.push(issue('low-margin', 'warn', 'commercial', `Thin margin (${est.marginPct}%)`, `Margin is only ${est.marginPct}%. That leaves no room for the things that always come up. Make sure it's a deliberate call, not an accident.`, "Lift the margin on the Costs tab, or confirm you're cutting it on purpose."))
  }

  /* ── Overhead recovery (proxy: are we on starter rates?) ──────── */
  if (ctx.businessConfigured === false) {
    issues.push(issue('overhead-starter-rates', 'warn', 'commercial', 'Quoting on starter rates', "This is priced on generic starter rates, not your numbers. Your overheads — insurance, super, admin, tooling, ute — aren't in here, so you may be under-recovering on every quote.", 'Set up your Business profile so quotes carry your real rates and overheads.'))
  }

  /* ── Deposit on a larger quote ────────────────────────────────── */
  if (est.expected >= depositThreshold) {
    issues.push(issue('no-deposit', 'warn', 'commercial', 'Big job, no deposit terms', `This is a ${fmt(est.expected)} job. Funding materials and labour out of your own pocket on a job this size is how cash flow kills contractors. Take a deposit.`, 'Add deposit/progress-claim terms before this goes to the client.'))
  }

  /* ── Risky assumptions ────────────────────────────────────────── */
  if (spec.soil === 'unknown' && (spec.prepRequired || spec.excavationDepthMm > 0 || isConcrete)) {
    issues.push(issue('soil-unknown', 'warn', 'scope', 'Ground not confirmed', "The soil type is still unknown. Reactive clay, rock or fill changes the dig, the disposal and the price. Don't lock a fixed price on a guess.", 'Confirm the ground (or quote it as an estimate with a site-visit note).'))
  }
  if (!spec.location || resolveLocation(spec.location).name === 'Unknown location') {
    issues.push(issue('location-unknown', 'warn', 'scope', 'Site location not pinned', "I can't pin the town, so concrete freight and crew travel are assumed. In remote areas that's thousands of dollars of difference.", 'Set the location on the Job tab so freight and travel price correctly.'))
  }
  if (isConcrete && spec.access === 'difficult' && !spec.pumpRequired) {
    issues.push(issue('access-difficult-no-pump', 'warn', 'plant', 'Tough access, no pump', "Access is difficult but there's no pump allowed for. Barrowing concrete a long way blows your labour out fast.", 'Price a pump or confirm the truck can get close enough to chute.'))
  }
  if (est.confidence < lowConfidence) {
    issues.push(issue('low-confidence', 'info', 'scope', `Low confidence (${est.confidence}%)`, `I'm only ${est.confidence}% confident in these inputs. That usually means something key isn't nailed down yet.`, 'Tighten the inputs on the Job tab, or send it as an estimate — not a fixed price.'))
  }
  if (!spec.rawDescription.trim() && !spec.notes.trim()) {
    issues.push(issue('no-scope-notes', 'info', 'scope', 'No scope notes', "There's no description or scope notes on this quote. A bare quote with no scope is where disputes start — write down what's in and what's out.", 'Add a short scope/inclusions note on the Job tab.'))
  }

  return assemble(issues)
}

/* ───────────────────────── Helpers ───────────────────────── */

function issue(id: string, severity: ForemanSeverity, area: ForemanArea, title: string, detail: string, fix: string): ForemanIssue {
  return { id, severity, area, title, detail, fix }
}

function assemble(raw: ForemanIssue[]): ForemanReport {
  const issues = [...raw].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  const blockers = issues.filter((i) => i.severity === 'block')
  const warnings = issues.filter((i) => i.severity === 'warn')
  const advisories = issues.filter((i) => i.severity === 'info')

  const status: ForemanStatus = blockers.length > 0 ? 'BLOCK' : warnings.length > 0 ? 'WARN' : 'READY'

  return {
    status,
    summary: summaryFor(status, blockers.length, warnings.length),
    issues,
    blockers,
    warnings,
    advisories,
    nextAction: nextActionFor(status, blockers, warnings),
    canExport: status !== 'BLOCK',
  }
}

function summaryFor(status: ForemanStatus, blocks: number, warns: number): string {
  if (status === 'BLOCK') {
    return `Hold up — ${blocks} thing${blocks === 1 ? '' : 's'} will hurt you if this goes out as-is. Sort ${blocks === 1 ? 'it' : 'them'} before you send.`
  }
  if (status === 'WARN') {
    return `Quote stacks up, but ${warns} thing${warns === 1 ? '' : 's'} ${warns === 1 ? 'is' : 'are'} worth a look before it leaves the door.`
  }
  return 'Quote looks complete and client-ready. Nothing missing that I can see — give it a final eyeball and send it.'
}

function nextActionFor(status: ForemanStatus, blockers: ForemanIssue[], warnings: ForemanIssue[]): string {
  if (status === 'BLOCK') return `Start here: ${blockers[0].fix}`
  if (status === 'WARN') return `Worth sorting first: ${warnings[0].fix}`
  return 'Looks good to send. Do a final read of the scope and price, then export.'
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('en-AU')

export const FOREMAN_STATUS_LABEL: Record<ForemanStatus, string> = {
  READY: 'READY',
  WARN: 'WARN',
  BLOCK: 'BLOCK',
}
