// Shared protocol between the browser client and the server-side apprentice
// proxy. Pure types + tiny helpers only — safe to import from both the client
// bundle and the Node server (no DOM, no Node APIs).

import type { JobSpec } from '../engine/types'
import type { RateBook } from '../engine/pricing'

/** A single conversation turn sent to the model (system turns are excluded). */
export interface PayloadMessage {
  role: 'user' | 'assistant'
  content: string
}

/** A compact, anonymised summary of a past quote for cross-job learning. */
export interface PriorQuoteSummary {
  jobType: string
  finish: string
  area: number
  location: string
  expected: number
  perM2: number
  status: string
  hiddenCostTitles: string[]
}

/** User/business preferences the apprentice should respect. */
export interface ApprenticePrefs {
  businessName: string
  defaultMarginPct: number
  region?: string
}

/**
 * Everything the apprentice is given "access" to for a turn. The client
 * assembles this from its store and posts it alongside the messages. The
 * server also owns the pricing engine, so this is grounding context — the
 * authoritative numbers always come from the engine-backed `price_job` tool.
 */
export interface ApprenticeContext {
  rawDescription: string
  spec: JobSpec
  ratebook: RateBook
  prefs: ApprenticePrefs
  priorQuotes: PriorQuoteSummary[]
}

export interface ApprenticeRequest {
  quoteId: string
  messages: PayloadMessage[]
  context: ApprenticeContext
}

/**
 * The clean event stream the server emits back to the client over SSE. The
 * client never sees provider-specific shapes — only these.
 */
export type ClientEvent =
  | { type: 'text'; delta: string }
  | { type: 'chips'; chips: string[] }
  | { type: 'spec'; patch: Partial<JobSpec> }
  | { type: 'ready' } // apprentice has enough to price — show "Crunch the numbers"
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface ApprenticeHealth {
  live: boolean
  provider: 'openai' | 'mock' | 'local'
  model?: string
}

export const SSE_DELIMITER = '\n\n'

/** Encode a ClientEvent as an SSE frame. */
export function encodeSSE(ev: ClientEvent | { type: string; [k: string]: unknown }): string {
  return `data: ${JSON.stringify(ev)}${SSE_DELIMITER}`
}
