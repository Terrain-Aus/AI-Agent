// Core domain types for TerrainPro Estimator.
// Everything the quoting engine consumes or produces is defined here.

export type Trade = 'concreting' | 'landscaping' | 'earthworks'

export type JobType =
  | 'driveway'
  | 'slab'
  | 'shed-slab'
  | 'path-footpath'
  | 'patio'
  | 'retaining-wall'
  | 'excavation'
  | 'paving'
  | 'turf'
  | 'other'

export type Finish =
  | 'plain'
  | 'exposed-aggregate'
  | 'coloured'
  | 'stencil'
  | 'polished'
  | 'broom'
  | 'pavers'
  | 'turf'
  | 'na'

export type Access = 'easy' | 'moderate' | 'difficult'

export type SoilType = 'unknown' | 'sand' | 'clay' | 'reactive-clay' | 'rock' | 'fill' | 'loam'

/** The structured spec the AI Apprentice assembles before quoting. */
export interface JobSpec {
  trade: Trade
  jobType: JobType
  finish: Finish
  /** Square metres of the finished surface. */
  area: number
  /** Slab/pour thickness in mm. */
  thicknessMm: number
  location: string
  /** Excavation / dig depth in mm where relevant. */
  excavationDepthMm: number
  soil: SoilType
  access: Access
  prepRequired: boolean
  boxingRequired: boolean
  reinforcement: boolean
  pumpRequired: boolean
  /** Linear metres of formwork / edge boxing, derived if not supplied. */
  perimeterM?: number
  /** Free-text the contractor originally typed. */
  rawDescription: string
  notes: string
}

export interface LineItem {
  label: string
  detail: string
  qty: number
  unit: string
  rate: number
  total: number
}

export interface CostCategory {
  key: 'materials' | 'labour' | 'machinery' | 'disposal' | 'delivery'
  title: string
  items: LineItem[]
  subtotal: number
}

export type HiddenCostSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface HiddenCost {
  id: string
  title: string
  /** Apprentice-voice explanation of why this bites contractors. */
  why: string
  severity: HiddenCostSeverity
  /** Estimated dollar impact if missed. */
  estImpact: number
  /** Whether the impact is already baked into the quote total. */
  included: boolean
}

export interface Estimate {
  categories: CostCategory[]
  /** Sum of all category subtotals (the build cost before margin). */
  baseCost: number
  hiddenCosts: HiddenCost[]
  /** Contingency added for risk / hidden cost exposure. */
  contingency: number
  marginPct: number
  marginAmount: number
  /** Subtotal ex-GST. */
  subtotalExGst: number
  gst: number
  /** Headline expected price inc GST. */
  expected: number
  low: number
  high: number
  /** Plain-language summary in the apprentice's voice. */
  summary: string
  /** Confidence the apprentice has in the inputs (0-100). */
  confidence: number
}

export interface Quote {
  id: string
  title: string
  client: string
  status: 'draft' | 'chatting' | 'estimated' | 'sent' | 'won' | 'lost' | 'invoiced'
  createdAt: number
  updatedAt: number
  spec: JobSpec
  estimate?: Estimate
  chat: ChatMessage[]
}

export interface ChatMessage {
  id: string
  role: 'apprentice' | 'user' | 'system'
  text: string
  /** Optional quick-reply chips offered with an apprentice message. */
  chips?: string[]
  ts: number
}
