// The AI Apprentice's local "brain": parse a rough job description, work out
// what's missing, and ask switched-on, trade-focused questions. This runs
// fully offline and deterministically so the app works without an API key.
// When VITE_AI_PROVIDER is configured, src/lib/ai.ts can override/augment this.

import type { Finish, JobSpec, JobType, SoilType, Trade } from './types'
import { DEFAULT_THICKNESS, LOCATIONS, resolveLocation } from './pricing'

export const EMPTY_SPEC: JobSpec = {
  trade: 'concreting',
  jobType: 'slab',
  finish: 'plain',
  area: 0,
  thicknessMm: 100,
  location: '',
  excavationDepthMm: 0,
  soil: 'unknown',
  access: 'easy',
  prepRequired: false,
  boxingRequired: false,
  reinforcement: true,
  pumpRequired: false,
  rawDescription: '',
  notes: '',
}

/** Extract as much structured spec as possible from free text. */
export function parseDescription(text: string): Partial<JobSpec> {
  const t = ' ' + text.toLowerCase() + ' '
  const out: Partial<JobSpec> = { rawDescription: text.trim() }

  // Area: "80m2", "80 m²", "80 square metres"
  const areaMatch = t.match(/(\d{1,4}(?:\.\d+)?)\s*(?:m2|m²|sqm|square\s*m(?:et(?:re|er)s?)?)/)
  if (areaMatch) out.area = parseFloat(areaMatch[1])

  // Thickness: "125mm", "100 mm"
  const thickMatch = t.match(/(\d{2,3})\s*mm/)
  if (thickMatch) out.thicknessMm = parseInt(thickMatch[1], 10)

  // Job type
  const jt: [RegExp, JobType][] = [
    [/driveway|crossover|crossing/, 'driveway'],
    [/shed\s*slab|shed\s*pad|garage\s*slab/, 'shed-slab'],
    [/footpath|path\b|pathway|walkway/, 'path-footpath'],
    [/patio|alfresco|entertain/, 'patio'],
    [/retaining|retain wall|sleeper wall/, 'retaining-wall'],
    [/excavat|earthwork|bulk dig|cut and fill|cut & fill/, 'excavation'],
    [/paving|paver/, 'paving'],
    [/turf|lawn|landscap/, 'turf'],
    [/slab|pour/, 'slab'],
  ]
  for (const [re, val] of jt) if (re.test(t)) { out.jobType = val; break }

  // Trade follows job type
  if (out.jobType === 'turf' || out.jobType === 'paving') out.trade = 'landscaping'
  else if (out.jobType === 'excavation') out.trade = 'earthworks'
  else out.trade = 'concreting'

  // Finish
  const fn: [RegExp, Finish][] = [
    [/exposed\s*agg|exposed\s*aggregate|exp\s*agg/, 'exposed-aggregate'],
    [/colou?red|oxide/, 'coloured'],
    [/stencil/, 'stencil'],
    [/polish/, 'polished'],
    [/broom/, 'broom'],
    [/paver/, 'pavers'],
    [/turf|lawn/, 'turf'],
    [/plain|grey|gray/, 'plain'],
  ]
  for (const [re, val] of fn) if (re.test(t)) { out.finish = val; break }

  // Location — match known towns
  const loc = LOCATIONS.find((l) => t.includes(l.name.toLowerCase()))
  if (loc) out.location = loc.name
  else {
    // "in <Place>" capture
    const inMatch = text.match(/\bin\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/)
    if (inMatch) out.location = inMatch[1]
  }

  // Soil hints
  const soil: [RegExp, SoilType][] = [
    [/reactive|black soil|expansive/, 'reactive-clay'],
    [/\brock\b|sandstone|granite/, 'rock'],
    [/\bclay\b/, 'clay'],
    [/\bsand\b/, 'sand'],
    [/\bfill\b/, 'fill'],
  ]
  for (const [re, val] of soil) if (re.test(t)) { out.soil = val; break }

  // Boolean flags from keywords
  if (/\bprep\b|preparation|strip|trim|level the/.test(t)) out.prepRequired = true
  if (/\bboxing\b|box up|formwork|form up|set out forms/.test(t)) out.boxingRequired = true
  if (/\bpump\b|concrete pump|line pump|boom pump/.test(t)) out.pumpRequired = true
  if (/no reo|no mesh|unreinforced/.test(t)) out.reinforcement = false
  if (/tight access|no access|hard to get|difficult access|narrow/.test(t)) out.access = 'difficult'
  else if (/moderate access|side access/.test(t)) out.access = 'moderate'

  return out
}

export interface Question {
  id: keyof JobSpec | string
  text: string
  chips: string[]
  /** how to apply the chosen answer to the spec */
  apply: (spec: JobSpec, answer: string) => Partial<JobSpec>
}

/** Build the ordered list of questions for whatever's still missing/uncertain. */
export function nextQuestions(spec: JobSpec): Question[] {
  const qs: Question[] = []

  if (!spec.area || spec.area <= 0) {
    qs.push({
      id: 'area',
      text: "Righto. How big's the job — what's the area in square metres? Ballpark's fine, I'll work with it.",
      chips: ['40 m²', '80 m²', '120 m²', '200 m²'],
      apply: (_s, a) => ({ area: parseFloat(a) || 0 }),
    })
  }

  if (!spec.location || resolveLocation(spec.location).name === 'Unknown location') {
    qs.push({
      id: 'location',
      text: 'Where is it? Give me the town — location changes concrete freight and travel more than people think.',
      chips: ['Brisbane', 'Townsville', 'Mount Isa', 'Cairns'],
      apply: (_s, a) => ({ location: a }),
    })
  }

  qs.push({
    id: 'soil',
    text: "What's the ground like under it? This is the big one for hidden costs — reactive clay or rock will eat your margin.",
    chips: ['Normal / clay', 'Reactive / black soil', 'Rock', 'Sand', 'Not sure'],
    apply: (_s, a) => ({ soil: mapSoil(a) }),
  })

  qs.push({
    id: 'prep',
    text: 'Does it need site prep — strip, trim and compact — or is the pad already prepped and ready to pour?',
    chips: ['Needs full prep', 'Already prepped'],
    apply: (_s, a) => ({ prepRequired: /full|prep|strip|yes/i.test(a) && !/already/i.test(a) }),
  })

  qs.push({
    id: 'boxing',
    text: 'Are we boxing it up ourselves (formwork), or is it already boxed?',
    chips: ['We box it', 'Already boxed'],
    apply: (_s, a) => ({ boxingRequired: !/already|boxed up|no/i.test(a) }),
  })

  qs.push({
    id: 'access',
    text: "How's truck access to the pour? Can an agi back up to it, or are we pumping / barrowing?",
    chips: ['Easy — truck access', 'Moderate', 'Difficult — need a pump'],
    apply: (_s, a) => {
      if (/pump|difficult|barrow|no access/i.test(a)) return { access: 'difficult', pumpRequired: /pump/i.test(a) }
      if (/moderate/i.test(a)) return { access: 'moderate' }
      return { access: 'easy' }
    },
  })

  return qs
}

function mapSoil(a: string): SoilType {
  const t = a.toLowerCase()
  if (/reactive|black/.test(t)) return 'reactive-clay'
  if (/rock/.test(t)) return 'rock'
  if (/sand/.test(t)) return 'sand'
  if (/clay|normal/.test(t)) return 'clay'
  return 'unknown'
}

/** The apprentice's opening read on a fresh description — sets the tone. */
export function openingLine(spec: JobSpec): string {
  const known: string[] = []
  if (spec.area) known.push(`${spec.area}m²`)
  if (spec.jobType) known.push(spec.jobType.replace('-', ' '))
  if (spec.finish && spec.finish !== 'na' && spec.finish !== 'plain') known.push(spec.finish.replace('-', ' '))
  if (spec.location) known.push(`in ${spec.location}`)
  const summary = known.length ? known.join(' ') : 'this one'
  const loc = spec.location ? resolveLocation(spec.location) : null
  let line = `Got it — ${summary}. `
  if (loc?.remote) line += `${loc.name}'s remote, so I'm already thinking freight and travel. `
  line += "Before I price it I need to nail down a few things so we don't underquote. Quick questions:"
  return line
}

/** Default a JobSpec from parsed fragments, filling thickness etc. */
export function buildSpec(partial: Partial<JobSpec>): JobSpec {
  const merged: JobSpec = { ...EMPTY_SPEC, ...partial }
  if (!partial.thicknessMm && merged.jobType) {
    merged.thicknessMm = DEFAULT_THICKNESS[merged.jobType] || 100
  }
  return merged
}

export const TRADE_LABELS: Record<Trade, string> = {
  concreting: 'Concreting',
  landscaping: 'Landscaping',
  earthworks: 'Earthworks',
}
