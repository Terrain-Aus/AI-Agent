// Hidden Cost Intelligence — forgotten-item detection.
//
// NOT a pipeline stage. A pure helper that inspects the QuoteContext + the
// physical QuantityResult and proposes commonly-forgotten PHYSICAL items as
// ScopeItems. When the contractor accepts one it RE-ENTERS the pipeline at
// Stage 1 (addForgottenScopeItems) and flows Quantity → Rate → Commercial.
//
// It emits scope items (physical), never money — pricing stays with the engines.

import type { BusinessIntelligence, QuantityResult, QuoteContext, ScopeCategory, ScopeItem } from './types'

export interface ForgottenSuggestion {
  /** Stable id so the UI can track accept/dismiss. */
  key: string
  title: string
  /** Why it bites — apprentice voice. */
  why: string
  /** The physical scope item that re-enters Stage 1 if accepted. */
  item: ScopeItem
}

const hasCategory = (q: QuantityResult, c: ScopeCategory) => q.lines.some((l) => l.category === c)

export function suggestForgottenItems(ctx: QuoteContext, quantity: QuantityResult, bi: BusinessIntelligence): ForgottenSuggestion[] {
  const out: ForgottenSuggestion[] = []
  const digging = quantity.derived.cutFillVolumes.bankM3 > 0
  const looseM3 = quantity.derived.cutFillVolumes.looseM3
  const access = ctx.site.accessConstraints

  // 1. Mobilisation / float — almost always needed once plant is on the job.
  if (digging && !hasCategory(quantity, 'mobilisation')) {
    out.push({
      key: 'mobilisation',
      title: 'Mobilisation / float',
      why: "Getting the machine to site and back isn't free. Float on/off is a real cost contractors forget on quote day.",
      item: { id: 'mobilisation', description: 'Float plant on/off site', category: 'mobilisation', quantity: 2, unit: 'hr', machineId: 'ex5t' },
    })
  }

  // 2. Traffic control — road reserve / restricted access work.
  if (!hasCategory(quantity, 'traffic-control') && (access.includes('restricted-hours') || access.includes('tight') || digging)) {
    out.push({
      key: 'traffic-control',
      title: 'Traffic control',
      why: 'Working on or near a road reserve needs a TGS and often a TMA. Council will ask, and it’s billable.',
      item: { id: 'traffic-control', description: 'Traffic control (TGS)', category: 'traffic-control', quantity: 8, unit: 'hr', roleId: 'leading' },
    })
  }

  // 3. Survey / set-out — levels are billable and easy to skip.
  if (digging && !hasCategory(quantity, 'survey-setout')) {
    out.push({
      key: 'survey-setout',
      title: 'Survey / set-out',
      why: 'Levels and set-out take time and gear. Skip it and you risk re-digging — quote it.',
      item: { id: 'survey-setout', description: 'Survey & set-out', category: 'survey-setout', quantity: 4, unit: 'hr', roleId: 'leading' },
    })
  }

  // 4. Spoil cartage trucks — sized from loose volume / truck payload.
  if (looseM3 > 0 && !hasCategory(quantity, 'cartage')) {
    const density = bi.productivity.bulkingFactors[ctx.site.soilType] ?? 1.8
    const tonnes = looseM3 * density
    const loads = Math.max(1, Math.ceil(tonnes / bi.productivity.truckPayloadTonnes))
    out.push({
      key: 'cartage',
      title: 'Spoil cartage',
      why: `~${tonnes.toFixed(0)}t of spoil to shift — about ${loads} truck load${loads === 1 ? '' : 's'}. Haulage is separate from the tip fee.`,
      item: { id: 'cartage', description: `Cart spoil (~${loads} loads)`, category: 'cartage', quantity: loads * 2, unit: 'hr', machineId: 'tipper' },
    })
  }

  // 5. Wet-weather standby for sites flagged wet.
  if (access.includes('wet')) {
    out.push({
      key: 'wet-standby',
      title: 'Wet-weather standby',
      why: 'Flagged wet. A washout means standby labour and a re-mobilise — build a small allowance.',
      item: { id: 'wet-standby', description: 'Wet-weather standby allowance', category: 'labour', quantity: 4, unit: 'hr', roleId: 'labourer' },
    })
  }

  return out
}
