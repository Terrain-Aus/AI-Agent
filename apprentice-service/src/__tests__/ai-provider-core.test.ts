// M3C-1 — provider core tests. Fake model calls ONLY: no real LLM, no
// network, no cloud SDKs, no env. Covers the required M3C-1 behaviours:
//
//   - createAiReviewProvider builds the M3B prompt for the review context and
//     passes it, unchanged, to the injected model call — exactly once;
//   - a JSON reply parses to untrusted output and flows through runAiReview
//     to 'completed' (with provenance when supplied) — validation stays with
//     the M3A sanitiser, the core adds none of its own;
//   - a reply that is not a bare JSON object (prose, fenced JSON, scalars,
//     arrays, wrong shape, extra keys) is NOT repaired → 'invalidOutput';
//   - a throwing/rejecting model call propagates → 'unavailable' with the
//     safe generic message and no leaked transport error;
//   - parseAiModelReply is pure, deterministic and never throws;
//   - no mutation of the frozen context or the built prompt.

import { describe, it, expect } from 'vitest'
import { operatorId, reviewedAmount } from '../branded'
import { DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import type { ReviewItem } from '../review-items'
import type { QuoteReviewRequestShape } from '../review-request'
import { runDeterministicRules } from '../rules'
import type { SiteConditions } from '../site-conditions'
import {
  buildAiReviewContext,
  buildAiReviewPrompt,
  createAiReviewProvider,
  parseAiModelReply,
  runAiReview,
  type AiReviewPrompt,
} from '../ai'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const request = (reviewItems?: ReviewItem[], siteConditions?: SiteConditions): QuoteReviewRequestShape => ({
  reviewContractVersion: 1,
  quoteId: 'q_m3c1',
  operatorId: operatorId('op_test'),
  quote: {
    quoteId: 'q_m3c1',
    trade: 'earthworks',
    totals: {
      subtotalExGst: reviewedAmount(4321.99),
      gst: reviewedAmount(432.2),
      total: reviewedAmount(4754.19),
      marginPct: 27.5,
    },
    scopeNote: 'CONFIDENTIAL-SCOPE-NOTE',
    ...(reviewItems !== undefined ? { reviewItems } : {}),
  },
  validation: { status: 'PASS', findings: [] },
  ...(siteConditions !== undefined ? { siteConditions } : {}),
})

const EXCAVATION_ITEM: ReviewItem = {
  kind: 'excavation',
  id: 'it_1',
  label: 'Trench for stormwater',
  amount: reviewedAmount(1500.5),
}

/** Standard triggering scenario → HF-SPOIL, HF-SERVICES, RK-ACCESS. */
const standardRequest = () => request([{ ...EXCAVATION_ITEM }], { access: 'restricted' })
const standardFlags = () => runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG)

/** Fake/mock provenance values only — no real transport exists in M3C-1. */
const FAKE_PROVENANCE = { provider: 'fake-provider', model: 'fake-model-1', generatedAt: '2026-01-01T00:00:00Z' }

const validReplyObject = () => ({
  observations: [
    {
      kind: 'observation',
      message: 'Access is restricted; double-check plant-size assumptions against the excavation scope.',
      relatedFlagCodes: ['RK-ACCESS'],
    },
    { kind: 'question', message: 'Is hand excavation expected near the boundary fence?' },
  ],
  provenance: { ...FAKE_PROVENANCE },
})

/** A fake model call that records the prompts it was given. */
const fakeModelCall = (reply: string): { call: (prompt: AiReviewPrompt) => Promise<string>; prompts: AiReviewPrompt[] } => {
  const prompts: AiReviewPrompt[] = []
  return {
    prompts,
    call: (prompt) => {
      prompts.push(prompt)
      return Promise.resolve(reply)
    },
  }
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}

// ---------------------------------------------------------------------------
// parseAiModelReply — pure parse, no repair, never throws
// ---------------------------------------------------------------------------

describe('M3C-1 — parseAiModelReply', () => {
  it('parses a JSON object reply to its value', () => {
    expect(parseAiModelReply('{"observations":[]}')).toEqual({ observations: [] })
  })

  it('tolerates surrounding whitespace (JSON.parse semantics, not repair)', () => {
    expect(parseAiModelReply('  {"observations":[]}\n')).toEqual({ observations: [] })
  })

  it('parses JSON scalars and arrays to their values (the sanitiser rejects them later)', () => {
    expect(parseAiModelReply('42')).toBe(42)
    expect(parseAiModelReply('null')).toBe(null)
    expect(parseAiModelReply('[]')).toEqual([])
    expect(parseAiModelReply('"observations"')).toBe('observations')
  })

  it('returns non-JSON text verbatim — prose is not trimmed, fences are not stripped', () => {
    const prose = 'Here is my review: {"observations":[]}'
    const fenced = '```json\n{"observations":[]}\n```'
    expect(parseAiModelReply(prose)).toBe(prose)
    expect(parseAiModelReply(fenced)).toBe(fenced)
    expect(parseAiModelReply('')).toBe('')
    expect(parseAiModelReply('not json at all')).toBe('not json at all')
  })

  it('returns a non-string reply verbatim (misbehaving transport)', () => {
    const object = { observations: [] }
    expect(parseAiModelReply(object)).toBe(object)
    expect(parseAiModelReply(undefined)).toBe(undefined)
    expect(parseAiModelReply(42)).toBe(42)
  })

  it('is deterministic — same reply text, identical value, every call', () => {
    const reply = JSON.stringify(validReplyObject())
    expect(parseAiModelReply(reply)).toEqual(parseAiModelReply(reply))
  })
})

// ---------------------------------------------------------------------------
// createAiReviewProvider — prompt building and the single model call
// ---------------------------------------------------------------------------

describe('M3C-1 — createAiReviewProvider prompt handling', () => {
  it('passes exactly the M3B prompt for the context to the model call, once per review', async () => {
    const context = buildAiReviewContext(standardRequest(), standardFlags())
    const { call, prompts } = fakeModelCall('{"observations":[]}')
    const provider = createAiReviewProvider(call)

    await provider.review(context)

    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toEqual(buildAiReviewPrompt(context))
    expect(prompts[0].context).toBe(context)
  })

  it('a second review makes a second, independent model call', async () => {
    const context = buildAiReviewContext(standardRequest(), standardFlags())
    const { call, prompts } = fakeModelCall('{"observations":[]}')
    const provider = createAiReviewProvider(call)

    await provider.review(context)
    await provider.review(context)

    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toEqual(prompts[1])
  })

  it('returns the parsed reply without validating it — validation stays with the sanitiser', async () => {
    const wrongShape = { observations: [{ kind: 'observation', message: 'x', severity: 'critical' }] }
    const provider = createAiReviewProvider(() => Promise.resolve(JSON.stringify(wrongShape)))
    const output = await provider.review(buildAiReviewContext(standardRequest(), standardFlags()))
    expect(output).toEqual(wrongShape)
  })

  it('mutates neither the frozen context nor the prompt it built', async () => {
    const flags = deepFreeze(standardFlags())
    const context = buildAiReviewContext(deepFreeze(standardRequest()), flags)
    const snapshot = JSON.parse(JSON.stringify(context))
    const { call, prompts } = fakeModelCall(JSON.stringify(validReplyObject()))

    await createAiReviewProvider(call).review(context)

    expect(JSON.parse(JSON.stringify(context))).toEqual(snapshot)
    expect(prompts[0]).toEqual(buildAiReviewPrompt(context))
  })
})

// ---------------------------------------------------------------------------
// End-to-end through the M3A boundary (runAiReview + sanitiser)
// ---------------------------------------------------------------------------

describe('M3C-1 — provider core through runAiReview', () => {
  it('valid JSON reply → completed, with the validated observations and provenance', async () => {
    const provider = createAiReviewProvider(() => Promise.resolve(JSON.stringify(validReplyObject())))
    const result = await runAiReview(standardRequest(), standardFlags(), provider)

    expect(result.status).toBe('completed')
    expect(result.observations).toHaveLength(2)
    expect(result.observations[0].relatedFlagCodes).toEqual(['RK-ACCESS'])
    expect(result.provenance).toEqual(FAKE_PROVENANCE)
    expect(result.error).toBeUndefined()
  })

  it('valid JSON reply with an empty observations array → completed and empty', async () => {
    const provider = createAiReviewProvider(() => Promise.resolve('{"observations":[]}'))
    const result = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(result).toEqual({ status: 'completed', observations: [] })
  })

  it('non-JSON prose reply → invalidOutput, no repair attempted', async () => {
    const provider = createAiReviewProvider(() =>
      Promise.resolve('Sure! Here is the JSON you asked for: {"observations":[]}'),
    )
    const result = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(result.status).toBe('invalidOutput')
    expect(result.observations).toEqual([])
    expect(result.error?.kind).toBe('invalidOutput')
  })

  it('code-fenced JSON reply → invalidOutput — fences are not stripped', async () => {
    const provider = createAiReviewProvider(() =>
      Promise.resolve('```json\n{"observations":[]}\n```'),
    )
    const result = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(result.status).toBe('invalidOutput')
  })

  it.each([
    ['JSON array', '[]'],
    ['JSON string', '"observations"'],
    ['JSON number', '42'],
    ['JSON null', 'null'],
    ['wrong-shape object', '{"answers":[]}'],
    ['extra top-level key', '{"observations":[],"confidence":0.9}'],
    ['ownership field on an observation', '{"observations":[{"kind":"observation","message":"x","code":"HF-SPOIL"}]}'],
    ['non-emitted relatedFlagCodes reference', '{"observations":[{"kind":"observation","message":"x","relatedFlagCodes":["RK-WATER"]}]}'],
  ])('parseable but invalid reply (%s) → invalidOutput via the sanitiser', async (_name, reply) => {
    const provider = createAiReviewProvider(() => Promise.resolve(reply))
    const result = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(result.status).toBe('invalidOutput')
    expect(result.observations).toEqual([])
  })

  it('rejecting model call → unavailable with the safe generic message, no transport error leaked', async () => {
    const provider = createAiReviewProvider(() =>
      Promise.reject(new Error('ECONNREFUSED 10.0.0.1:443 — secret transport detail')),
    )
    const result = await runAiReview(standardRequest(), standardFlags(), provider)

    expect(result.status).toBe('unavailable')
    expect(result.observations).toEqual([])
    expect(result.error?.kind).toBe('providerError')
    expect(result.error?.message).not.toContain('ECONNREFUSED')
    expect(result.error?.message).not.toContain('secret')
  })

  it('synchronously throwing model call → unavailable, boundary never throws', async () => {
    const provider = createAiReviewProvider(() => {
      throw new Error('sync transport failure')
    })
    const result = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(result.status).toBe('unavailable')
    expect(result.error?.kind).toBe('providerError')
  })

  it('repeated reviews with the same reply are stable and deterministic', async () => {
    const provider = createAiReviewProvider(() => Promise.resolve(JSON.stringify(validReplyObject())))
    const first = await runAiReview(standardRequest(), standardFlags(), provider)
    const second = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(second).toEqual(first)
  })

  it('deterministic flags remain untouched by a full provider-core review', async () => {
    const flags = deepFreeze(standardFlags())
    const snapshot = JSON.parse(JSON.stringify(flags))
    const provider = createAiReviewProvider(() => Promise.resolve(JSON.stringify(validReplyObject())))

    await runAiReview(deepFreeze(standardRequest()), flags, provider)

    expect(JSON.parse(JSON.stringify(flags))).toEqual(snapshot)
  })
})
