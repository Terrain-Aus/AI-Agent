// TRADE ENGINE — classify jobType, activate only the inputs that jobType needs,
// capture facts + confidence sources + risk metadata, set derived flags, list
// missing inputs. Captures FACTS, not numbers. (quote) => quote.

import type { DerivedFlags, FieldSource, Quote } from './types'
import { audit } from './types'

interface JobTypeDef {
  trade: 'earthworks' | 'concreting' | 'landscaping'
  required: string[] // input fields this jobType activates
  derived: Partial<DerivedFlags>
}

// Pluggable per-jobType input maps.
const JOB_TYPES: Record<string, JobTypeDef> = {
  // earthworks
  pad_prep: { trade: 'earthworks', required: ['areaM2', 'cutDepthMm', 'material', 'access', 'cartageRequired', 'importRoadbase', 'roadbaseDepthMm'], derived: { producesSpoil: true, requiresImport: true } },
  site_cut: { trade: 'earthworks', required: ['areaM2', 'cutDepthMm', 'material', 'access', 'cartageRequired'], derived: { producesSpoil: true } },
  trenching: { trade: 'earthworks', required: ['lengthM', 'widthMm', 'depthMm', 'material', 'cartageRequired'], derived: { producesSpoil: true, servicesCritical: true } },
  bulk_excavation: { trade: 'earthworks', required: ['areaM2', 'cutDepthMm', 'material', 'access', 'cartageRequired'], derived: { producesSpoil: true } },
  final_trim: { trade: 'earthworks', required: ['areaM2', 'gradeToleranceMm'], derived: { precisionJob: true } },
  spoil_removal: { trade: 'earthworks', required: ['spoilLooseM3'], derived: { producesSpoil: true } },
  retaining_wall_excavation: { trade: 'earthworks', required: ['lengthM', 'depthMm', 'material'], derived: { producesSpoil: true, servicesCritical: true } },
  // concreting — six job types. Each activates only the inputs it needs.
  slab: { trade: 'concreting', required: ['areaM2', 'thicknessMm', 'finish', 'reinforcement', 'access', 'subBase'], derived: {} },
  exposed_aggregate_driveway: { trade: 'concreting', required: ['areaM2', 'thicknessMm', 'finish', 'reinforcement', 'access', 'subBase', 'finishSampleApproved'], derived: { requiresImport: true } },
  footings_piers: { trade: 'concreting', required: ['footingLengthM', 'footingWidthMm', 'footingDepthMm', 'pierCount', 'pierDiameterMm', 'pierDepthMm', 'reinforcement', 'access'], derived: { producesSpoil: true } },
  shed_slab: { trade: 'concreting', required: ['areaM2', 'thicknessMm', 'finish', 'reinforcement', 'access', 'subBase', 'thickenedEdge'], derived: { requiresImport: true } },
  crossover: { trade: 'concreting', required: ['areaM2', 'thicknessMm', 'finish', 'reinforcement', 'access', 'subBase', 'councilApproval', 'trafficControl'], derived: { requiresImport: true } },
  paths_flatwork: { trade: 'concreting', required: ['areaM2', 'thicknessMm', 'finish', 'reinforcement', 'access'], derived: {} },
  // legacy aliases (kept so existing inputs/UI keep resolving)
  house_slab: { trade: 'concreting', required: ['areaM2', 'thicknessMm', 'finish', 'reinforcement', 'access', 'subBase'], derived: {} },
  driveway: { trade: 'concreting', required: ['areaM2', 'thicknessMm', 'finish', 'reinforcement', 'access', 'subBase'], derived: { requiresImport: true } },
}

function classify(text: string): string {
  const t = text.toLowerCase()
  if (/pad\s*prep|pad to ffl|build.*pad/.test(t)) return 'pad_prep'
  if (/trench/.test(t)) return 'trenching'
  if (/final\s*trim|trim to grade/.test(t)) return 'final_trim'
  if (/spoil removal|cart.*spoil only/.test(t)) return 'spoil_removal'
  if (/bulk excavat/.test(t)) return 'bulk_excavation'
  if (/site cut|cut to level/.test(t)) return 'site_cut'
  if (/slab|driveway|concret|footing|path|patio/.test(t)) return /driveway/.test(t) ? 'driveway' : 'house_slab'
  return 'pad_prep'
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : undefined)

export function runTrade(q: Quote): Quote {
  const jobType = (q.rawInput.answers.jobType as string) || classify(q.rawInput.userText)
  const def = JOB_TYPES[jobType] ?? JOB_TYPES.pad_prep
  q.jobType = jobType
  q.trade = def.trade

  // Activate only the fields this jobType needs; capture source/confidence.
  const answers = q.rawInput.answers
  const sources = (answers.__sources as Record<string, FieldSource> | undefined) ?? {}
  for (const field of def.required) {
    if (answers[field] !== undefined && answers[field] !== '') {
      q.inputs[field] = answers[field] as string | number | boolean
      q.inputSources[field] = sources[field] ?? { source: 'stated', confidence: 0.7 }
    } else {
      q.missingInputs.push(field)
      q.inputSources[field] = { source: 'unknown', confidence: 0.2 }
    }
  }

  // Risk metadata (facts about certainty, not numbers).
  q.riskMetadata = {
    siteVisit: answers.siteVisit === true,
    groundConfirmed: answers.groundConfirmed === true,
    servicesLocated: answers.servicesLocated === true,
  }

  // Derived flags.
  q.derived = {
    producesSpoil: def.derived.producesSpoil ?? false,
    requiresImport: def.derived.requiresImport ?? (num(q.inputs.roadbaseDepthMm) ?? 0) > 0,
    precisionJob: def.derived.precisionJob ?? false,
    servicesCritical: def.derived.servicesCritical ?? false,
  }
  if (q.inputs.cartageRequired === false) q.derived.producesSpoil = q.derived.producesSpoil // unchanged; cartage handled in quantity

  audit(q, { engine: 'Trade', rule: 'classify', result: `jobType=${jobType} trade=${def.trade}, missing=[${q.missingInputs.join(',')}]` })
  return q
}
