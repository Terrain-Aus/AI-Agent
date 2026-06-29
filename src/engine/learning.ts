// Apprentice Learning Engine.
//
// The apprentice gets smarter the more you quote. Locally it learns from YOUR
// finished quotes; the same shapes are designed to aggregate ACROSS users via
// Supabase (see note at the bottom) so the apprentice can learn from similar
// jobs other contractors have completed.
//
// What it learns:
//   • Costing  — your real $/m² by job type & finish, drift vs the rate book.
//   • Winning  — your win rate, and which price band tends to win work.
//   • Invoicing— variation/extra patterns so future quotes pre-empt them.

import type { Quote } from './types'

export interface JobTypeInsight {
  jobType: string
  finish: string
  samples: number
  avgPerM2: number
  avgArea: number
  /** How your actual $/m² drifts from the seed rate book (informational). */
  trend: 'up' | 'down' | 'flat'
}

export interface WinInsight {
  quoted: number
  won: number
  lost: number
  winRate: number
  /** Average margin % on jobs you won vs lost — pricing-to-win signal. */
  avgWonMargin: number
  avgLostMargin: number
}

export interface LearningModel {
  totalLearned: number
  jobInsights: JobTypeInsight[]
  win: WinInsight
  /** Most common hidden cost the apprentice has caught for you. */
  topHiddenCost: { title: string; count: number } | null
  /** One-line, apprentice-voice takeaways surfaced on the dashboard. */
  takeaways: string[]
}

const DONE_STATUSES = ['won', 'lost', 'sent', 'estimated']

export function learnFrom(quotes: Quote[]): LearningModel {
  const estimated = quotes.filter((q) => q.estimate && DONE_STATUSES.includes(q.status))

  // ---- Costing insights, grouped by jobType+finish ----
  const groups = new Map<string, Quote[]>()
  for (const q of estimated) {
    const key = `${q.spec.jobType}|${q.spec.finish}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(q)
  }
  const jobInsights: JobTypeInsight[] = [...groups.entries()]
    .map(([key, qs]) => {
      const [jobType, finish] = key.split('|')
      const perM2s = qs
        .filter((q) => q.spec.area > 0 && q.estimate)
        .map((q) => q.estimate!.expected / q.spec.area)
      const avgPerM2 = avg(perM2s)
      const half = Math.ceil(perM2s.length / 2)
      const recent = avg(perM2s.slice(0, half))
      const older = avg(perM2s.slice(half))
      const trend: JobTypeInsight['trend'] =
        recent > older * 1.04 ? 'up' : recent < older * 0.96 ? 'down' : 'flat'
      return {
        jobType,
        finish,
        samples: qs.length,
        avgPerM2: Math.round(avgPerM2),
        avgArea: Math.round(avg(qs.map((q) => q.spec.area))),
        trend,
      }
    })
    .sort((a, b) => b.samples - a.samples)

  // ---- Winning insights ----
  const won = quotes.filter((q) => q.status === 'won')
  const lost = quotes.filter((q) => q.status === 'lost')
  const quoted = quotes.filter((q) => ['sent', 'won', 'lost'].includes(q.status)).length
  const win: WinInsight = {
    quoted,
    won: won.length,
    lost: lost.length,
    winRate: won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0,
    avgWonMargin: Math.round(avg(won.map((q) => q.estimate?.marginPct ?? 0))),
    avgLostMargin: Math.round(avg(lost.map((q) => q.estimate?.marginPct ?? 0))),
  }

  // ---- Hidden cost frequency ----
  const hcCount = new Map<string, number>()
  for (const q of estimated) {
    for (const h of q.estimate?.hiddenCosts ?? []) {
      hcCount.set(h.title, (hcCount.get(h.title) ?? 0) + 1)
    }
  }
  const topEntry = [...hcCount.entries()].sort((a, b) => b[1] - a[1])[0]
  const topHiddenCost = topEntry ? { title: topEntry[0], count: topEntry[1] } : null

  // ---- Apprentice takeaways ----
  const takeaways: string[] = []
  if (estimated.length === 0) {
    takeaways.push("I haven't learned anything yet — finish a couple of quotes and I'll start spotting your patterns.")
  } else {
    const top = jobInsights[0]
    if (top) {
      takeaways.push(
        `You quote ${labelJob(top.jobType)} most — averaging ${aud(top.avgPerM2)}/m² across ${top.samples} job${top.samples > 1 ? 's' : ''}.${
          top.trend === 'up' ? " Your rate's trending up; good, costs are too." : top.trend === 'down' ? " Your rate's slipping — make sure you're not chasing work too cheap." : ''
        }`,
      )
    }
    if (win.won + win.lost >= 2) {
      takeaways.push(
        win.winRate >= 50
          ? `Win rate's ${win.winRate}%. Solid — you're not leaving money on the table.`
          : `Win rate's ${win.winRate}%. ${win.avgLostMargin > win.avgWonMargin ? `You're losing the higher-margin jobs — that's a sales problem, not a price problem.` : `Might be worth a sharper number on the next few.`}`,
      )
    }
    if (topHiddenCost) {
      takeaways.push(`Most common trap I've caught for you: "${topHiddenCost.title}" (${topHiddenCost.count}×). Keep an eye out for it early.`)
    }
  }

  return {
    totalLearned: estimated.length,
    jobInsights,
    win,
    topHiddenCost,
    takeaways,
  }
}

/**
 * Find past quotes similar to the one in progress — the basis for
 * "learns off other users with similar jobs". Locally this matches your own
 * history; wired to Supabase it would query the shared `quotes` table filtered
 * by job_type/finish/region (with RLS allowing anonymised reads).
 */
export function similarJobs(quotes: Quote[], jobType: string, finish: string, currentId?: string): Quote[] {
  return quotes
    .filter((q) => q.id !== currentId && q.estimate && q.spec.jobType === jobType)
    .sort((a, b) => (a.spec.finish === finish ? -1 : 0) - (b.spec.finish === finish ? -1 : 0) || b.updatedAt - a.updatedAt)
    .slice(0, 5)
}

const avg = (a: number[]) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0)
const aud = (n: number) => '$' + Math.round(n).toLocaleString('en-AU')
function labelJob(j: string) {
  return j.replace('-', ' ')
}
