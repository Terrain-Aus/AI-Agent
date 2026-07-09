// M4B — POST /review AI-capable adapter tests.
//
// The AI adapter is pure COMPOSITION of existing pieces: the unchanged M4A
// deterministic adapter runs first, then the M3A runAiReview runner with an
// INJECTED provider, and the 200 body is the deterministic ReviewResult plus
// an additive `aiReview` field. These tests prove the composition, prove AI
// failure is never an endpoint failure, prove commercial data never reaches
// the provider, prove M4A error handling is preserved (provider never called
// on route/body errors), and prove the new adapter file stays isolated from
// the real AI runtime (no SDK, no real client, no env reads, no network).
// Every provider here is a local fake — no model call, no network.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  handleReviewEndpointWithAi,
  type ReviewEndpointWithAiResponse,
} from '../endpoint/ai-review-endpoint'
import { handleReviewEndpoint, type ReviewEndpointRequest } from '../endpoint/review-endpoint'
import { deterministicReview } from '../review'
import { DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import { isQuoteReviewRequest } from '../guards'
import type { LearningProfile } from '../learning'
import type { QuoteReviewRequest } from '../review-request'
import type { AiReviewContext, AiReviewProvider } from '../ai/contracts'
import { operatorId } from '../branded'

// ─── fixtures ────────────────────────────────────────────────────────────────

/** A valid M1-shaped request body: no reviewItems, no siteConditions. */
const m1Body = () => ({
  reviewContractVersion: 1,
  quoteId: 'q_001',
  operatorId: 'op_dave',
  quote: { quoteId: 'q_001' },
  validation: { status: 'PASS', findings: [] },
})

/**
 * A valid M2A-shaped body that trips every registered rule AND carries a
 * commercial amount on its review item so the context-leak tests have
 * something to look for (the leak test adds scopeNote/totals on top).
 */
const m2aBody = () => ({
  reviewContractVersion: 1,
  quoteId: 'q_002',
  operatorId: 'op_dave',
  quote: {
    quoteId: 'q_002',
    reviewItems: [{ kind: 'excavation', label: 'Trench 20m', amount: 4321.99 }],
  },
  validation: { status: 'WARN', findings: [] },
  siteConditions: {
    access: 'restricted',
    roadReserveAdjacent: true,
    wetConditions: true,
  },
})

const post = (body: unknown): ReviewEndpointRequest => ({
  method: 'POST',
  path: '/review',
  body,
})

const emptyProfileFor = (id: string): LearningProfile => ({
  operatorId: operatorId(id),
  profileVersion: 1,
  events: [],
})

/** Narrow an untyped fixture through the real guard (fails loudly if invalid). */
const asContract = (body: unknown): QuoteReviewRequest => {
  if (!isQuoteReviewRequest(body)) throw new Error('test fixture is not a valid QuoteReviewRequest')
  return body
}

/** A provider that records the context it saw and returns a fixed output. */
const recordingProvider = (output: unknown): AiReviewProvider & { contexts: AiReviewContext[] } => {
  const contexts: AiReviewContext[] = []
  return {
    contexts,
    async review(context) {
      contexts.push(context)
      return output
    },
  }
}

/** A provider whose call is a hard failure (rejection). */
const throwingProvider = (): AiReviewProvider & { calls: number[] } => {
  const calls: number[] = []
  return {
    calls,
    async review() {
      calls.push(1)
      throw new Error('provider exploded (must never leak)')
    },
  }
}

/** Valid output referencing only codes actually emitted for the m2a fixture. */
const validOutput = () => ({
  observations: [
    { kind: 'observation', message: 'Restricted access noted.', relatedFlagCodes: ['RK-ACCESS'] },
    { kind: 'question', message: 'Is a spoil destination confirmed?', relatedFlagCodes: ['HF-SPOIL'] },
  ],
  provenance: { provider: 'fake', model: 'fake-1', generatedAt: '2026-01-01T00:00:00Z' },
})

const expect200 = (response: ReviewEndpointWithAiResponse) => {
  expect(response.status).toBe(200)
  if (response.status !== 200) throw new Error('unreachable')
  return response.body
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}

const M2A_REGISTRY_ORDER = ['HF-SPOIL', 'HF-SERVICES', 'RK-ACCESS', 'RK-TRAFFIC', 'RK-WATER']

// ─── M4A unchanged ───────────────────────────────────────────────────────────

describe('M4B — the deterministic M4A endpoint is unchanged', () => {
  it('handleReviewEndpoint still returns the bare ReviewResult with no aiReview field', async () => {
    const response = await handleReviewEndpoint(post(m2aBody()))
    expect(response.status).toBe(200)
    if (response.status !== 200) throw new Error('unreachable')
    expect(Object.keys(response.body).sort()).toEqual(['flags', 'profileDelta'])
    expect('aiReview' in response.body).toBe(false)
  })

  it('deterministic rules and output order are unchanged', async () => {
    const direct = await deterministicReview(
      asContract(m2aBody()),
      emptyProfileFor('op_dave'),
      DEFAULT_HARD_FLOOR_CONFIG,
    )
    expect(direct.flags.map((f) => f.code)).toEqual(M2A_REGISTRY_ORDER)
    expect(direct.profileDelta).toEqual({ appendEvents: [] })
  })
})

// ─── success path ────────────────────────────────────────────────────────────

describe('M4B — AI-capable success path', () => {
  it('returns 200 with flags, profileDelta AND aiReview', async () => {
    const body = expect200(await handleReviewEndpointWithAi(post(m2aBody()), recordingProvider(validOutput())))
    expect(Object.keys(body).sort()).toEqual(['aiReview', 'flags', 'profileDelta'])
  })

  it('runs the deterministic review first — flags/profileDelta equal the M4A result exactly', async () => {
    const withAi = expect200(await handleReviewEndpointWithAi(post(m2aBody()), recordingProvider(validOutput())))
    const deterministic = await handleReviewEndpoint(post(m2aBody()))
    expect(deterministic.status).toBe(200)
    if (deterministic.status !== 200) throw new Error('unreachable')
    expect(withAi.flags).toEqual(deterministic.body.flags)
    expect(withAi.profileDelta).toEqual(deterministic.body.profileDelta)
    expect(withAi.flags.map((f) => f.code)).toEqual(M2A_REGISTRY_ORDER)
  })

  it('passes the deterministic flags into the provider context', async () => {
    const provider = recordingProvider(validOutput())
    expect200(await handleReviewEndpointWithAi(post(m2aBody()), provider))
    expect(provider.contexts).toHaveLength(1)
    const context = provider.contexts[0]
    expect(context.deterministicFlags.map((f) => f.code)).toEqual(M2A_REGISTRY_ORDER)
  })

  it('valid provider output → aiReview.status "completed" with sanitised observations', async () => {
    const body = expect200(await handleReviewEndpointWithAi(post(m2aBody()), recordingProvider(validOutput())))
    expect(body.aiReview.status).toBe('completed')
    expect(body.aiReview.observations).toHaveLength(2)
    expect(body.aiReview.provenance).toEqual({
      provider: 'fake',
      model: 'fake-1',
      generatedAt: '2026-01-01T00:00:00Z',
    })
  })

  it('AI observations may reference deterministic flag codes emitted in the current review', async () => {
    const body = expect200(await handleReviewEndpointWithAi(post(m2aBody()), recordingProvider(validOutput())))
    expect(body.aiReview.observations[0].relatedFlagCodes).toEqual(['RK-ACCESS'])
    expect(body.aiReview.observations[1].relatedFlagCodes).toEqual(['HF-SPOIL'])
  })

  it('observations referencing a code NOT emitted in this review are rejected → invalidOutput', async () => {
    // HF-SPOIL exists in the registry but is NOT emitted for the M1 fixture.
    const output = {
      observations: [{ kind: 'observation', message: 'Spoil?', relatedFlagCodes: ['HF-SPOIL'] }],
    }
    const body = expect200(await handleReviewEndpointWithAi(post(m1Body()), recordingProvider(output)))
    expect(body.aiReview.status).toBe('invalidOutput')
    expect(body.aiReview.observations).toEqual([])
    // The deterministic result is untouched by the rejection.
    expect(body.flags).toEqual([])
    expect(body.profileDelta).toEqual({ appendEvents: [] })
  })
})

// ─── AI failure is not an endpoint failure ───────────────────────────────────

describe('M4B — AI failure never fails the endpoint', () => {
  it('provider throw/rejection → 200 with aiReview.status "unavailable" and [] observations', async () => {
    const body = expect200(await handleReviewEndpointWithAi(post(m2aBody()), throwingProvider()))
    expect(body.aiReview.status).toBe('unavailable')
    expect(body.aiReview.observations).toEqual([])
    // Deterministic result still fully present.
    expect(body.flags.map((f) => f.code)).toEqual(M2A_REGISTRY_ORDER)
    expect(body.profileDelta).toEqual({ appendEvents: [] })
  })

  it('provider throw leaks no raw error message into the response', async () => {
    const response = await handleReviewEndpointWithAi(post(m2aBody()), throwingProvider())
    expect(JSON.stringify(response)).not.toContain('provider exploded')
  })

  it('malformed provider output → 200 with aiReview.status "invalidOutput" and [] observations', async () => {
    for (const malformed of [
      null,
      'not-an-object',
      { observations: 'nope' },
      { observations: [{ kind: 'observation', message: 'x', code: 'HF-SPOIL' }] }, // smuggled key
      { observations: [], extraKey: true },
    ]) {
      const body = expect200(await handleReviewEndpointWithAi(post(m2aBody()), recordingProvider(malformed)))
      expect(body.aiReview.status).toBe('invalidOutput')
      expect(body.aiReview.observations).toEqual([])
      expect(body.flags.map((f) => f.code)).toEqual(M2A_REGISTRY_ORDER)
    }
  })
})

// ─── commercial-data boundary ────────────────────────────────────────────────

describe('M4B — commercial data never reaches the provider context', () => {
  it('context carries no amounts, totals, GST, margins, rates, prices, profile, scopeNote or raw request', async () => {
    const provider = recordingProvider(validOutput())
    const base = m2aBody()
    const requestBody = {
      ...base,
      quote: {
        ...base.quote,
        scopeNote: 'SECRET-SCOPE-NOTE',
        totals: { subtotalExGst: 1000, gst: 100, total: 1100, marginPct: 22.5 },
      },
    }
    expect200(await handleReviewEndpointWithAi(post(requestBody), provider))
    expect(provider.contexts).toHaveLength(1)
    const context = provider.contexts[0]
    // The context is ONLY the three sanctioned blocks.
    expect(Object.keys(context).sort()).toEqual(['deterministicFlags', 'reviewItems', 'siteConditions'])
    // Review items are amount-free copies.
    for (const item of context.reviewItems ?? []) {
      expect('amount' in item).toBe(false)
    }
    // Nothing commercial and no request echo anywhere in the serialised context.
    const serialised = JSON.stringify(context)
    expect(serialised).not.toContain('4321.99')
    expect(serialised).not.toContain('amount')
    expect(serialised).not.toMatch(/total/i)
    expect(serialised).not.toMatch(/gst/i)
    expect(serialised).not.toMatch(/margin/i)
    expect(serialised).not.toMatch(/\brate/i)
    expect(serialised).not.toMatch(/price/i)
    expect(serialised).not.toMatch(/businessProfile/i)
    expect(serialised).not.toContain('SECRET-SCOPE-NOTE')
    expect(serialised).not.toContain('scopeNote')
    expect(serialised).not.toContain('quoteId')
    expect(serialised).not.toContain('operatorId')
  })
})

// ─── M4A error handling preserved ────────────────────────────────────────────

describe('M4B — M4A route/body errors are preserved and never call the provider', () => {
  it('wrong path returns 404 NOT_FOUND unchanged', async () => {
    const provider = throwingProvider()
    const response = await handleReviewEndpointWithAi({ method: 'POST', path: '/nope', body: m1Body() }, provider)
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } })
    expect(provider.calls).toEqual([])
  })

  it('wrong method returns 405 METHOD_NOT_ALLOWED unchanged', async () => {
    const provider = throwingProvider()
    const response = await handleReviewEndpointWithAi({ method: 'GET', path: '/review', body: m1Body() }, provider)
    expect(response.status).toBe(405)
    expect(response.body).toEqual({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } })
    expect(provider.calls).toEqual([])
  })

  it('invalid body returns 400 INVALID_REVIEW_REQUEST unchanged', async () => {
    const provider = throwingProvider()
    const response = await handleReviewEndpointWithAi(post({ nope: true }), provider)
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: { code: 'INVALID_REVIEW_REQUEST', message: 'Invalid review request' },
    })
    expect(provider.calls).toEqual([])
  })

  it('error responses carry no aiReview field', async () => {
    const response = await handleReviewEndpointWithAi(post(null), recordingProvider(validOutput()))
    expect(response.status).toBe(400)
    expect('aiReview' in response.body).toBe(false)
  })
})

// ─── purity / isolation ──────────────────────────────────────────────────────

describe('M4B — purity and isolation', () => {
  it('does not mutate the input request (deep-frozen body handles cleanly)', async () => {
    const body = deepFreeze(m2aBody())
    const request = deepFreeze({ method: 'POST', path: '/review', body })
    const before = JSON.stringify(request)
    const response = await handleReviewEndpointWithAi(request, recordingProvider(validOutput()))
    expect(response.status).toBe(200)
    expect(JSON.stringify(request)).toBe(before)
  })

  it('the AI adapter source imports no real AI runtime, reads no env, makes no network calls', () => {
    const endpointFile = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'endpoint',
      'ai-review-endpoint.ts',
    )
    const text = readFileSync(endpointFile, 'utf8')
    // No SDK, no real client, no prompted provider, no payload port, no client port.
    expect(text).not.toContain('@google/genai')
    expect(text).not.toContain('VertexGenerationClient')
    expect(text).not.toContain('PromptedAiReviewProvider')
    expect(text).not.toContain('ProviderPayload')
    expect(text).not.toContain('AiGenerationClient')
    // No environment reads, no network primitives.
    expect(text).not.toContain('process.' + 'env')
    expect(text).not.toMatch(/\bfetch\s*\(/)
    expect(text).not.toMatch(/\bhttps?\.request\b/)
    // Every import is an intra-package relative path (same dir or one level up).
    const importRe = /\bfrom\s+['"]([^'"]+)['"]/g
    let m: RegExpExecArray | null
    let importCount = 0
    while ((m = importRe.exec(text)) !== null) {
      importCount += 1
      expect(m[1].startsWith('./') || m[1].startsWith('../')).toBe(true)
      expect(m[1].startsWith('../../')).toBe(false)
    }
    expect(importCount).toBeGreaterThan(0)
  })
})
