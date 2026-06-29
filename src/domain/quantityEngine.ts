// Quantity Engine — RunQuantity + RunTrade (pre-Quantity trade detection).
//
// R1: QuantityResult is physical only. Every quantity must pass through qty();
// the branded Quantity type makes assigning a plain number (money included)
// a compile error.

import type { QuantityItem, QuantityResult, QuoteContext, RawInput, RunQuantity, RunTrade, TradeBreakdown, TradeTask } from './schema'
import { qty } from './schema'

/** Lightweight keyword trade detection from the raw job description. */
export const runTrade: RunTrade = (raw: RawInput): TradeBreakdown => {
  const t = `${raw.jobDescription} ${raw.trade ?? ''} ${raw.siteNotes ?? ''}`.toLowerCase()
  const tasks: TradeTask[] = []
  const detected =
    /drain|pipe|rcp|stormwater/.test(t) ? 'drainage' : /concret|slab|driveway|footing/.test(t) ? 'concreting' : /excavat|cut|fill|bulk|earth/.test(t) ? 'earthworks' : raw.trade ?? 'earthworks'

  if (detected === 'earthworks' || /excavat|cut|fill|bulk|earth/.test(t)) tasks.push({ taskCode: 'EXC', label: 'Bulk excavation' })
  if (/cart|haul|spoil|truck/.test(t) || tasks.length) tasks.push({ taskCode: 'CART', label: 'Cart spoil off site' })
  if (detected === 'drainage') tasks.push({ taskCode: 'PIPE', label: 'Lay drainage pipe' })
  if (detected === 'concreting') tasks.push({ taskCode: 'CONC', label: 'Supply & place concrete' })
  if (tasks.length === 0) tasks.push({ taskCode: 'GEN', label: 'General works' })

  return { detectedTrade: detected, tasks }
}

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) || 0 : 0)

/**
 * Derive physical quantities from the captured site fields + detected tasks.
 * Reads geometry from rawInput.capturedFields (areaM2, depthMm, lengthM, …).
 * NO rates, NO dollars — physical only.
 */
export const runQuantity: RunQuantity = (ctx: QuoteContext): QuantityResult => {
  const f = ctx.rawInput.capturedFields
  const areaM2 = num(f.areaM2 ?? f.area)
  const depthMm = num(f.depthMm ?? f.depth)
  const lengthM = num(f.lengthM ?? f.length)
  const bankM3 = round2((areaM2 * depthMm) / 1000)

  const items: QuantityItem[] = []
  const tasks = ctx.trade?.tasks ?? []

  for (const task of tasks) {
    switch (task.taskCode) {
      case 'EXC':
        if (bankM3 > 0) items.push({ taskCode: 'EXC', unit: 'm3', quantity: qty(bankM3), assumptions: [`${areaM2}m² × ${depthMm}mm`] })
        break
      case 'CART': {
        const loose = round2(bankM3 * 1.25)
        if (loose > 0) items.push({ taskCode: 'CART', unit: 'm3', quantity: qty(loose), assumptions: ['25% swell applied'] })
        break
      }
      case 'PIPE':
        if (lengthM > 0) items.push({ taskCode: 'PIPE', unit: 'lm', quantity: qty(lengthM), assumptions: ['trench length = pipe length'] })
        break
      case 'CONC':
        if (bankM3 > 0) items.push({ taskCode: 'CONC', unit: 'm3', quantity: qty(bankM3), assumptions: ['pour volume = excavated volume'] })
        break
      default:
        break
    }
  }

  return { items }
}

const round2 = (n: number) => Math.round(n * 100) / 100
