// AI provider abstraction. The app ships with a fully-working local
// deterministic apprentice (src/engine/apprentice.ts). This module is the
// seam where a real LLM — Claude or OpenAI — takes over when configured.
//
// To enable, set in .env:
//   VITE_AI_PROVIDER=claude        # or "openai"
//   VITE_AI_API_KEY=sk-...
//   VITE_AI_MODEL=claude-opus-4-8  # optional override
//
// In production you'd proxy these calls through a Supabase Edge Function or
// your own backend so the key never ships to the browser — `chatComplete`
// is written so only its internals change, not its callers.

import type { JobSpec } from '../engine/types'

export type AIProvider = 'claude' | 'openai' | 'local'

export const aiProvider: AIProvider =
  (import.meta.env.VITE_AI_PROVIDER as AIProvider) || 'local'

export const isLiveAI = aiProvider === 'claude' || aiProvider === 'openai'

const API_KEY = import.meta.env.VITE_AI_API_KEY
const MODEL =
  import.meta.env.VITE_AI_MODEL ||
  (aiProvider === 'openai' ? 'gpt-4o' : 'claude-opus-4-8')

/** The apprentice's system persona — shared by every provider. */
export const APPRENTICE_SYSTEM_PROMPT = `You are the AI Apprentice inside TerrainPro Estimator, a quoting tool for Australian concreting, landscaping and earthworks contractors.

Personality: a switched-on 4th-year apprentice. Practical, blunt, trade-focused, zero corporate fluff. You talk like someone on the tools.

Your ONE job: stop the contractor from underquoting. Always hunt for hidden costs — remote freight, reactive/black soil, rock, poor access/pumps, sealing, council crossings, spoil disposal, short-load fees, wet weather.

When given a rough job description, ask only the missing questions needed to price it, one batch at a time, then produce: low / expected / high estimates, material, labour, machinery, disposal and delivery breakdowns, hidden-cost warnings, and a recommended margin. Use Australian rates and GST. Be concise.`

export interface ChatTurn {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * Single entry point for a chat completion. Returns assistant text.
 * Falls back to a thrown error if called in 'local' mode — callers should
 * check `isLiveAI` first and use the local apprentice engine otherwise.
 */
export async function chatComplete(messages: ChatTurn[]): Promise<string> {
  if (aiProvider === 'claude') return callClaude(messages)
  if (aiProvider === 'openai') return callOpenAI(messages)
  throw new Error('AI provider is "local" — use the local apprentice engine instead.')
}

async function callClaude(messages: ChatTurn[]): Promise<string> {
  const system = messages.find((m) => m.role === 'system')?.content ?? APPRENTICE_SYSTEM_PROMPT
  const turns = messages.filter((m) => m.role !== 'system')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY as string,
      'anthropic-version': '2023-06-01',
      // Required for direct browser calls during local dev:
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    }),
  })
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data?.content?.[0]?.text ?? ''
}

async function callOpenAI(messages: ChatTurn[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 1024 }),
  })
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

/** Helper to seed an LLM conversation with the current spec context. */
export function specContext(spec: JobSpec): string {
  return `Current job spec so far: ${JSON.stringify(spec)}`
}
