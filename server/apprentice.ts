// Apprentice orchestrator. Owns the system prompt, the tool definitions and the
// engine-backed executors. The model can talk, but every dollar figure comes
// from the deterministic estimator/hidden-cost engine via `price_job` — so the
// apprentice can never invent pricing.

import type { AssistantProvider, ToolDef } from './llm/types'
import type { ApprenticeRequest, ClientEvent, PriorQuoteSummary } from '../src/lib/apprenticeProtocol'
import type { JobSpec } from '../src/engine/types'
import { estimate } from '../src/engine/estimator'
import { riskSummary } from '../src/engine/hiddenCosts'
import { resolveLocation, JOB_TYPE_LABELS, FINISH_LABELS } from '../src/engine/pricing'

const SYSTEM = `You are the AI Apprentice inside TerrainPro Estimator, a quoting tool for Australian concreting, landscaping and earthworks contractors.

PERSONALITY: a switched-on 4th-year apprentice. Practical, blunt, trade-focused, no corporate fluff. Talk like someone on the tools. Keep every message short — 1-3 sentences.

YOUR ONE JOB: stop the contractor from underquoting. Aggressively hunt hidden costs (remote freight, reactive/black soil, rock, poor access/pumps, sealing, council crossings, spoil disposal, short-load fees, wet weather).

HARD RULES:
- NEVER invent or guess prices, rates or totals. Dollar figures may ONLY come from the price_job tool, which runs the real pricing engine. Do not state a price you didn't get from price_job.
- If required inputs are missing, ask ONE short batch of clarifying questions instead of pricing. The price_job tool tells you exactly what's missing in "missingFields".
- As soon as the user gives you a fact (area, location, soil, access, prep, boxing, finish, thickness), call update_job to record it.
- When you ask a question, also call offer_quick_replies with 2-4 short tappable options.
- Call price_job once you believe you have enough. If it returns no missingFields, give the contractor the headline number and tell them to review the flagged costs.

APPRENTICE MEMORY: when previous jobs include real outcomes (actuals), USE them. If similar past jobs ran over their build-cost estimate or a particular flagged cost actually hit repeatedly, warn the contractor up front and lean on it in your risk call. Real results beat guesses.

WORKFLOW: learn facts (update_job) → ask what's missing (with offer_quick_replies) → price_job → summarise bluntly. Use Australian rates and GST. The engine handles the maths; you handle the conversation and the risk call.`

const SPEC_FIELDS = {
  type: 'object',
  properties: {
    area: { type: 'number', description: 'Area in square metres' },
    thicknessMm: { type: 'number', description: 'Slab/pour thickness in mm' },
    location: { type: 'string', description: 'Town / suburb' },
    finish: { type: 'string', enum: ['plain', 'broom', 'exposed-aggregate', 'coloured', 'stencil', 'polished', 'pavers', 'turf', 'na'] },
    jobType: { type: 'string', enum: ['driveway', 'slab', 'shed-slab', 'path-footpath', 'patio', 'retaining-wall', 'excavation', 'paving', 'turf', 'other'] },
    soil: { type: 'string', enum: ['unknown', 'sand', 'clay', 'reactive-clay', 'rock', 'fill', 'loam'] },
    access: { type: 'string', enum: ['easy', 'moderate', 'difficult'] },
    excavationDepthMm: { type: 'number' },
    prepRequired: { type: 'boolean' },
    boxingRequired: { type: 'boolean' },
    reinforcement: { type: 'boolean' },
    pumpRequired: { type: 'boolean' },
  },
} as const

const TOOLS: ToolDef[] = [
  {
    name: 'update_job',
    description: 'Record one or more facts about the job as you learn them. Updates the live job spec.',
    parameters: SPEC_FIELDS as unknown as Record<string, unknown>,
  },
  {
    name: 'price_job',
    description:
      'Run the real pricing engine on the current job. Optionally pass field updates to apply first. Returns authoritative totals, category subtotals, hidden costs, risk level and a "missingFields" list. This is the ONLY source of prices.',
    parameters: {
      type: 'object',
      properties: { updates: SPEC_FIELDS },
    },
  },
  {
    name: 'offer_quick_replies',
    description: 'Attach 2-4 short tappable quick-reply options to your question.',
    parameters: {
      type: 'object',
      properties: { replies: { type: 'array', items: { type: 'string' }, maxItems: 4 } },
      required: ['replies'],
    },
  },
]

/** Fields the engine genuinely needs before it can price with confidence. */
function missingFields(spec: JobSpec): string[] {
  const missing: string[] = []
  if (!spec.area || spec.area <= 0) missing.push('area (m²)')
  if (!spec.location || resolveLocation(spec.location).name === 'Unknown location') missing.push('location / town')
  if (spec.soil === 'unknown') missing.push('ground / soil type')
  return missing
}

export async function runApprentice(provider: AssistantProvider, req: ApprenticeRequest, emit: (ev: ClientEvent) => void, signal?: AbortSignal): Promise<void> {
  // Mutable working copy of the spec for this turn.
  let spec: JobSpec = { ...req.context.spec }
  const ratebook = req.context.ratebook

  const applyPatch = (patch: Partial<JobSpec>) => {
    spec = { ...spec, ...patch }
    emit({ type: 'spec', patch })
  }

  const executeTool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    if (name === 'update_job') {
      const patch = sanitiseSpec(args)
      if (Object.keys(patch).length) applyPatch(patch)
      return { ok: true, spec: describeSpec(spec) }
    }

    if (name === 'price_job') {
      const updates = sanitiseSpec((args.updates as Record<string, unknown>) ?? {})
      if (Object.keys(updates).length) applyPatch(updates)
      const missing = missingFields(spec)
      if (missing.length > 0) {
        // Don't hand back numbers we can't stand behind.
        return { priced: false, missingFields: missing, note: 'Cannot price reliably until these are confirmed. Ask the contractor.' }
      }
      const est = estimate(spec, ratebook)
      const risk = riskSummary(est.hiddenCosts)
      emit({ type: 'ready' })
      return {
        priced: true,
        missingFields: [],
        total: est.expected,
        low: est.low,
        high: est.high,
        marginPct: est.marginPct,
        baseCost: est.baseCost,
        riskLevel: risk.level,
        uncoveredRisk: risk.exposure,
        confidence: est.confidence,
        categories: est.categories.map((c) => ({ title: c.title, subtotal: c.subtotal })),
        hiddenCosts: est.hiddenCosts.map((h) => ({ title: h.title, severity: h.severity, estImpact: h.estImpact, included: h.included })),
      }
    }

    if (name === 'offer_quick_replies') {
      const replies = Array.isArray(args.replies) ? (args.replies as unknown[]).map(String).slice(0, 4) : []
      if (replies.length) emit({ type: 'chips', chips: replies })
      return { ok: true }
    }

    return { error: `unknown tool ${name}` }
  }

  const instructions = `${SYSTEM}\n\n${contextBlock(req)}`

  await provider.run({
    instructions,
    messages: req.messages,
    tools: TOOLS,
    executeTool,
    emit,
    signal,
  })
}

/** Grounding context block appended to the system prompt. */
function contextBlock(req: ApprenticeRequest): string {
  const { context } = req
  const prior = context.priorQuotes.slice(0, 8)
  return [
    'CONTEXT (read-only — use for grounding, not as prices):',
    `Business: ${context.prefs.businessName}. Default margin ${context.prefs.defaultMarginPct}%.`,
    `Original request: "${context.rawDescription}"`,
    `Current job spec: ${JSON.stringify(describeSpec(context.spec))}`,
    `Rate book highlights: concrete $${context.ratebook.concretePerM3}/m³, exposed-agg premium $${context.ratebook.exposedAggPremiumM3}/m³, prep $${context.ratebook.prepLabourPerM2}/m², pump $${context.ratebook.pumpDayRate}/day, default margin ${context.ratebook.defaultMarginPct}%.`,
    prior.length
      ? `Your previous quotes (for similar-job context): ${prior.map((p) => `${p.area}m² ${p.jobType}/${p.finish} in ${p.location} @ $${p.perM2}/m² (${p.status})`).join('; ')}.`
      : 'No previous quotes yet.',
    memoryBlock(prior),
  ]
    .filter(Boolean)
    .join('\n')
}

/** Real-outcome learnings (Apprentice Memory) distilled for the model. */
function memoryBlock(prior: PriorQuoteSummary[]): string {
  const done = prior.filter((p) => p.actuals)
  if (done.length === 0) return ''
  const lines = done.map((p) => {
    const a = p.actuals!
    const bits = [`${p.area}m² ${p.jobType} in ${p.location}: cost ran ${a.costOverPct >= 0 ? '+' : ''}${a.costOverPct}% vs estimate`, a.madeMoney ? 'made money' : 'LOST money']
    if (a.hitHiddenCosts.length) bits.push(`actually hit: ${a.hitHiddenCosts.join(', ')}`)
    if (a.surpriseNote) bits.push(`surprise: ${a.surpriseNote}`)
    return '  • ' + bits.join('; ')
  })
  return `APPRENTICE MEMORY — real outcomes from completed jobs (weight these heavily):\n${lines.join('\n')}`
}

function describeSpec(spec: JobSpec) {
  return {
    trade: spec.trade,
    jobType: JOB_TYPE_LABELS[spec.jobType] ?? spec.jobType,
    finish: FINISH_LABELS[spec.finish] ?? spec.finish,
    area: spec.area,
    thicknessMm: spec.thicknessMm,
    location: spec.location || null,
    soil: spec.soil,
    access: spec.access,
    prepRequired: spec.prepRequired,
    boxingRequired: spec.boxingRequired,
    reinforcement: spec.reinforcement,
    pumpRequired: spec.pumpRequired,
  }
}

/** Whitelist + coerce model-supplied spec fields. */
function sanitiseSpec(args: Record<string, unknown>): Partial<JobSpec> {
  const out: Partial<JobSpec> = {}
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN)
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : undefined)
  if (args.area != null && !isNaN(num(args.area))) out.area = Math.max(0, num(args.area))
  if (args.thicknessMm != null && !isNaN(num(args.thicknessMm))) out.thicknessMm = Math.max(0, num(args.thicknessMm))
  if (args.excavationDepthMm != null && !isNaN(num(args.excavationDepthMm))) out.excavationDepthMm = Math.max(0, num(args.excavationDepthMm))
  if (typeof args.location === 'string') out.location = args.location
  const enums: Record<string, readonly string[]> = {
    finish: ['plain', 'broom', 'exposed-aggregate', 'coloured', 'stencil', 'polished', 'pavers', 'turf', 'na'],
    jobType: ['driveway', 'slab', 'shed-slab', 'path-footpath', 'patio', 'retaining-wall', 'excavation', 'paving', 'turf', 'other'],
    soil: ['unknown', 'sand', 'clay', 'reactive-clay', 'rock', 'fill', 'loam'],
    access: ['easy', 'moderate', 'difficult'],
  }
  for (const [k, allowed] of Object.entries(enums)) {
    const v = args[k]
    if (typeof v === 'string' && allowed.includes(v)) (out as Record<string, unknown>)[k] = v
  }
  for (const k of ['prepRequired', 'boxingRequired', 'reinforcement', 'pumpRequired'] as const) {
    const b = bool(args[k])
    if (b !== undefined) out[k] = b
  }
  return out
}

export const APPRENTICE_TOOLS = TOOLS // exported for tests/inspection
