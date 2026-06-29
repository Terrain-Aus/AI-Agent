// Deterministic mock provider. Drives the exact same tool/event pipeline as a
// real LLM so the streaming UI can be tested offline (no API key or network).
// Selected with AI_PROVIDER=mock. Demonstrates the swappable provider seam.

import type { AssistantProvider, RunArgs } from './types'
import { parseDescription } from '../../src/engine/apprentice'

const QUESTION: Record<string, { ask: string; chips: string[] }> = {
  'area (m²)': { ask: "How big's the job — area in square metres? Ballpark's fine.", chips: ['40 m²', '80 m²', '120 m²', '200 m²'] },
  'location / town': { ask: 'Where is it? The town changes concrete freight and travel more than people think.', chips: ['Brisbane', 'Townsville', 'Mount Isa', 'Cairns'] },
  'ground / soil type': { ask: "What's the ground like underneath? Reactive clay or rock will eat your margin.", chips: ['Normal / clay', 'Reactive / black soil', 'Rock', 'Not sure'] },
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export class MockProvider implements AssistantProvider {
  readonly name = 'mock' as const
  readonly model = 'mock-apprentice'

  async run({ messages, executeTool, emit }: RunArgs): Promise<void> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

    // 1. Learn whatever the last message told us.
    const { rawDescription, ...updates } = parseDescription(lastUser)
    void rawDescription
    if (Object.keys(updates).length) await executeTool('update_job', updates as Record<string, unknown>)

    // 2. Ask the engine where we stand (authoritative pricing + missing inputs).
    const est = (await executeTool('price_job', {})) as { missingFields?: string[]; total?: number; low?: number; high?: number; riskLevel?: string }

    const missing = est.missingFields ?? []
    if (missing.length > 0) {
      const key = missing[0]
      const q = QUESTION[key] ?? { ask: `Quick one — what's the ${key}?`, chips: [] }
      await this.streamText(emit, q.ask)
      if (q.chips.length) await executeTool('offer_quick_replies', { replies: q.chips })
    } else {
      // Enough to price — `price_job` already emitted `ready` + the estimate.
      const line = `Righto — I'd put this at $${(est.total ?? 0).toLocaleString('en-AU')} inc GST (range $${(est.low ?? 0).toLocaleString('en-AU')}–$${(est.high ?? 0).toLocaleString('en-AU')}). Risk reads ${est.riskLevel ?? 'low'}. Read the flagged costs before you send it, then hit Crunch the numbers.`
      await this.streamText(emit, line)
    }
    emit({ type: 'done' })
  }

  private async streamText(emit: RunArgs['emit'], text: string) {
    for (const word of text.split(' ')) {
      emit({ type: 'text', delta: word + ' ' })
      await sleep(18)
    }
  }
}
