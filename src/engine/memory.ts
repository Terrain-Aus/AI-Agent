// Apprentice Memory — the learning loop built from completed-job debriefs.
//
// Where learning.ts reasons about what you QUOTED, this reasons about what
// actually HAPPENED: did you win it, what did it really cost, did you make
// money, and which hidden costs actually bit. That calibration is what makes
// the apprentice smarter over time — and it feeds back into the live LLM
// context and the dashboard.

import type { Quote } from './types'

export interface AccuracyStat {
  /** actual build cost ÷ quoted build cost (1.0 = bang on). */
  costRatio: number
  /** Quoted vs actual revenue. */
  quoted: number
  actual: number
}

/** Per hidden-cost calibration: how often flagged vs how often it actually hit. */
export interface HiddenCostCalibration {
  id: string
  title: string
  flagged: number
  hit: number
  /** hit ÷ flagged — how reliably this warning turns into a real cost. */
  hitRate: number
}

export interface MemoryModel {
  /** Jobs with a completed debrief. */
  debriefed: number
  /** Average actual-vs-quoted build-cost ratio across debriefed jobs. */
  avgCostRatio: number
  /** Average realised gross margin % on completed jobs. */
  avgRealisedMargin: number
  /** Total real gross profit banked across debriefed jobs. */
  profitBanked: number
  /** Share of completed jobs that actually made money. */
  profitableRate: number
  /** How often the apprentice's flagged costs actually occurred. */
  hiddenCostHitRate: number
  /** Frequency of unflagged surprises. */
  surpriseRate: number
  calibration: HiddenCostCalibration[]
  /** Blunt, apprentice-voice takeaways grounded in real outcomes. */
  takeaways: string[]
}

const aud = (n: number) => '$' + Math.round(n).toLocaleString('en-AU')
const avg = (a: number[]) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0)

export function buildMemory(quotes: Quote[]): MemoryModel {
  const done = quotes.filter((q) => q.actuals && q.estimate)

  const costRatios: number[] = []
  const realisedMargins: number[] = []
  let profitBanked = 0
  let profitable = 0
  let totalFlagged = 0
  let totalHit = 0
  let surprises = 0
  const calMap = new Map<string, HiddenCostCalibration>()

  for (const q of done) {
    const a = q.actuals!
    const est = q.estimate!
    if (est.baseCost > 0) costRatios.push(a.finalCost / est.baseCost)
    const profit = a.finalRevenue - a.finalCost - a.surpriseCost
    profitBanked += profit
    if (profit > 0) profitable++
    if (a.finalRevenue > 0) realisedMargins.push((profit / a.finalRevenue) * 100)
    if (a.surpriseCost > 0) surprises++

    for (const h of est.hiddenCosts) {
      totalFlagged++
      const hit = a.hitHiddenCostIds.includes(h.id)
      if (hit) totalHit++
      const c = calMap.get(h.id) ?? { id: h.id, title: h.title, flagged: 0, hit: 0, hitRate: 0 }
      c.flagged++
      if (hit) c.hit++
      calMap.set(h.id, c)
    }
  }

  const calibration = [...calMap.values()]
    .map((c) => ({ ...c, hitRate: c.flagged ? c.hit / c.flagged : 0 }))
    .sort((a, b) => b.flagged - a.flagged || b.hitRate - a.hitRate)

  const model: MemoryModel = {
    debriefed: done.length,
    avgCostRatio: avg(costRatios),
    avgRealisedMargin: Math.round(avg(realisedMargins)),
    profitBanked: Math.round(profitBanked),
    profitableRate: done.length ? Math.round((profitable / done.length) * 100) : 0,
    hiddenCostHitRate: totalFlagged ? Math.round((totalHit / totalFlagged) * 100) : 0,
    surpriseRate: done.length ? Math.round((surprises / done.length) * 100) : 0,
    calibration,
    takeaways: [],
  }
  model.takeaways = takeaways(model, done)
  return model
}

function takeaways(m: MemoryModel, done: Quote[]): string[] {
  if (m.debriefed === 0) {
    return ['No debriefs yet. Close out a job — final cost, what you got paid, what actually bit — and I\'ll start learning from real results, not just quotes.']
  }
  const out: string[] = []

  // Estimate calibration.
  if (m.avgCostRatio >= 1.05) {
    out.push(`Your jobs run about ${Math.round((m.avgCostRatio - 1) * 100)}% over your build-cost estimate on average. Pad the quote or tighten the takeoff — that gap is coming out of your margin.`)
  } else if (m.avgCostRatio > 0 && m.avgCostRatio <= 0.95) {
    out.push(`You're costing about ${Math.round((1 - m.avgCostRatio) * 100)}% under what you quote — there's room to sharpen the number and win more work, or pocket the difference.`)
  } else if (m.avgCostRatio > 0) {
    out.push(`Your estimates are landing within 5% of actual cost. That's tight — trust your numbers.`)
  }

  // Profit reality.
  if (m.debriefed >= 2) {
    out.push(
      m.profitableRate >= 80
        ? `${m.profitableRate}% of your completed jobs made money — ${aud(m.profitBanked)} banked. You're pricing to profit, not just to win.`
        : `Only ${m.profitableRate}% of completed jobs made money (${aud(m.profitBanked)} net). Something's leaking — check where actuals beat the quote.`,
    )
  }

  // Hidden-cost calibration — the gold.
  const reliable = m.calibration.filter((c) => c.flagged >= 2 && c.hitRate >= 0.6)[0]
  if (reliable) {
    out.push(`"${reliable.title}" actually hit on ${reliable.hit}/${reliable.flagged} jobs — stop treating it as a warning and build it into the price as a line item.`)
  }
  const noisy = m.calibration.filter((c) => c.flagged >= 3 && c.hitRate <= 0.25)[0]
  if (noisy) {
    out.push(`"${noisy.title}" rarely actually lands (${noisy.hit}/${noisy.flagged}). Worth flagging, not worth padding heavily.`)
  }
  if (m.surpriseRate >= 40) {
    out.push(`${m.surpriseRate}% of jobs copped an unflagged surprise. Tell me what they were in the debrief and I'll start watching for them.`)
  }

  // Region-specific reality if we have it.
  const overByLoc = costOverByLocation(done)
  if (overByLoc) out.push(overByLoc)

  return out
}

function costOverByLocation(done: Quote[]): string | null {
  const byLoc = new Map<string, number[]>()
  for (const q of done) {
    const loc = q.spec.location || 'site'
    const est = q.estimate!
    if (est.baseCost > 0) {
      if (!byLoc.has(loc)) byLoc.set(loc, [])
      byLoc.get(loc)!.push(q.actuals!.finalCost / est.baseCost)
    }
  }
  for (const [loc, ratios] of byLoc) {
    if (ratios.length >= 2) {
      const r = avg(ratios)
      if (r >= 1.08) return `Heads up: your ${loc} jobs run ~${Math.round((r - 1) * 100)}% over estimate — price that region harder.`
    }
  }
  return null
}

/** Compact memory facts for a single similar job, for the live apprentice context. */
export function memoryNoteFor(q: Quote): string | null {
  if (!q.actuals || !q.estimate) return null
  const a = q.actuals
  const over = q.estimate.baseCost > 0 ? Math.round((a.finalCost / q.estimate.baseCost - 1) * 100) : 0
  const hit = a.hitHiddenCostIds.length
  return `${q.spec.area}m² ${q.spec.jobType} in ${q.spec.location || 'site'}: quoted ${aud(q.estimate.expected)}, actual cost ran ${over >= 0 ? '+' : ''}${over}% vs estimate, ${a.madeMoney ? 'made money' : 'LOST money'}${hit ? `, ${hit} flagged cost(s) actually hit` : ''}.`
}
