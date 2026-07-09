// M3C-1 — provider adapter port + fake client wiring tests. Fake generation
// clients ONLY: no real Gemini/Vertex/provider, no cloud SDK, no network, no
// env vars. Covers the required M3C-1 behaviours:
//
//   - PromptedAiReviewProvider implements the existing M3A AiReviewProvider;
//   - the adapter calls buildAiReviewPrompt(context) and maps the prompt into
//     a ProviderPayload with EXACTLY systemInstruction, userInstruction and
//     context (the safe M3A AiReviewContext) — nothing else;
//   - the fake generation client receives the ProviderPayload only — no raw
//     quote/request objects, and no commercial data (totals, GST, margin,
//     item amounts, confidential scope note) in the payload, in the client
//     input, or in the serialised payload;
//   - fake successful generation output flows end-to-end through
//     runAiReview(request, deterministicFlags, promptedProvider) → completed;
//   - malformed fake output → invalidOutput, observations: [];
//   - fake client throw/rejection → unavailable, observations: [], with no
//     raw provider error or stack exposed;
//   - the adapter does not mutate the AiReviewContext;
//   - repeated fake generation with the same context is stable;
//   - deterministic review output is unchanged.

import { describe, it, expect } from 'vitest'
import { operatorId, reviewedAmount } from '../branded'
import { DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import type { ReviewItem } from '../review-items'
import type { QuoteReviewRequestShape } from '../review-request'
import { runDeterministicRules } from '../rules'
import type { SiteConditions } from '../site-conditions'
import {
  PromptedAiReviewProvider,
  buildAiReviewContext,
  buildAiReviewPrompt,
  runAiReview,
  type AiGenerationClient,
  type AiReviewProvider,
  type ProviderPayload,
} from '../ai'

// ---------------------------------------------------------------------------
// Fixtures — a request that deliberately CARRIES commercial data (totals,
// GST, margin, item amount, confidential scope note), so the tests can prove
// none of it reaches the ProviderPayload or the fake generation client
// (M3A/M3B pattern).
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
const standardContext = () => buildAiReviewContext(standardRequest(), standardFlags())

/** A fake generation client that records every payload (and argument count) it receives. */
const capturingClient = (output: unknown): {
  client: AiGenerationClient
  payloads: ProviderPayload[]
  argCounts: number[]
} => {
  const payloads: ProviderPayload[] = []
  const argCounts: number[] = []
  const client: AiGenerationClient = {
    generate(...args: [ProviderPayload]) {
      argCounts.push(args.length)
      payloads.push(args[0])
      return Promise.resolve(output)
    },
  }
  return { client, payloads, argCounts }
}

/** Fake/mock provenance values only — no real provider exists in M3C-1. */
const FAKE_PROVENANCE = { provider: 'fake-provider', model: 'fake-model-1', generatedAt: '2026-01-01T00:00:00Z' }

const validGeneration = () => ({
  observations: [
    {
      kind: 'observation',
      message: 'Access is restricted; double-check plant-size assumptions against the excavation scope.',
      relatedFlagCodes: ['RK-ACCESS'],
    },
    { kind: 'question', message: 'Is hand excavation expected near the boundary fence?' },
    { kind: 'suggestion', message: 'Consider recording the intended spoil cart-away route in the scope note.' },
  ],
  provenance: { ...FAKE_PROVENANCE },
})

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}

// ---------------------------------------------------------------------------
// Adapter contract — implements AiReviewProvider, maps prompt → payload
// ---------------------------------------------------------------------------

describe('M3C-1 — PromptedAiReviewProvider implements AiReviewProvider', () => {
  it('is assignable to the existing M3A AiReviewProvider and exposes review()', () => {
    const provider: AiReviewProvider = new PromptedAiReviewProvider(capturingClient({ observations: [] }).client)
    expect(typeof provider.review).toBe('function')
  })

  it('review(context) resolves with the raw unknown generation result, unchanged and unparsed', async () => {
    const rawOutput = { anything: 'the adapter must not parse, repair or sanitise this' }
    const provider = new PromptedAiReviewProvider(capturingClient(rawOutput).client)
    const result = await provider.review(standardContext())
    expect(result).toBe(rawOutput) // the same reference — untouched
  })
})

describe('M3C-1 — the adapter builds the M3B prompt and maps it into ProviderPayload', () => {
  it('calls buildAiReviewPrompt(context): the payload carries exactly that prompt', async () => {
    const context = standardContext()
    const expectedPrompt = buildAiReviewPrompt(context)
    const { client, payloads } = capturingClient({ observations: [] })
    await new PromptedAiReviewProvider(client).review(context)

    expect(payloads).toHaveLength(1)
    expect(payloads[0].systemInstruction).toBe(expectedPrompt.systemInstruction)
    expect(payloads[0].userInstruction).toBe(expectedPrompt.userInstruction)
    expect(payloads[0].context).toBe(context) // the SAME safe context, passed through
  })

  it('the payload contains exactly systemInstruction, userInstruction and context — nothing else', async () => {
    const { client, payloads } = capturingClient({ observations: [] })
    await new PromptedAiReviewProvider(client).review(standardContext())
    expect(Object.keys(payloads[0]).sort()).toEqual(['context', 'systemInstruction', 'userInstruction'])
  })

  it('the fake generation client receives the ProviderPayload only — a single payload argument', async () => {
    const { client, payloads, argCounts } = capturingClient({ observations: [] })
    await new PromptedAiReviewProvider(client).review(standardContext())
    expect(argCounts).toEqual([1])
    expect(payloads[0]).toBeTypeOf('object')
  })
})

// ---------------------------------------------------------------------------
// Payload safety — no raw quote/request objects, no commercial data
// ---------------------------------------------------------------------------

describe('M3C-1 — ProviderPayload carries no raw quote/request objects and no commercial data', () => {
  it('payload.context is the safe AiReviewContext shape, not a quote or request', async () => {
    const { client, payloads } = capturingClient({ observations: [] })
    await new PromptedAiReviewProvider(client).review(standardContext())
    const payload = payloads[0] as unknown as Record<string, unknown>
    expect('quote' in payload).toBe(false)
    expect('request' in payload).toBe(false)
    expect(Object.keys(payloads[0].context).sort()).toEqual(['deterministicFlags', 'reviewItems', 'siteConditions'])
    const contextKeys = Object.keys(payloads[0].context)
    expect(contextKeys).not.toContain('quote')
    expect(contextKeys).not.toContain('totals')
    expect(contextKeys).not.toContain('validation')
  })

  it('commercial data (totals, GST, margin, item amount, scope note) never reaches the client input', async () => {
    const { client, payloads } = capturingClient({ observations: [] })
    await new PromptedAiReviewProvider(client).review(standardContext())

    // The serialised payload — everything the fake generation client received.
    const serialised = JSON.stringify(payloads[0])
    expect(serialised).not.toContain('totals')
    expect(serialised).not.toContain('subtotalExGst')
    expect(serialised).not.toContain('marginPct')
    expect(serialised).not.toContain('4321.99') // subtotal ex GST
    expect(serialised).not.toContain('432.2') // GST
    expect(serialised).not.toContain('4754.19') // total
    expect(serialised).not.toContain('27.5') // margin
    expect(serialised).not.toContain('1500.5') // the review item's amount
    expect(serialised).not.toContain('"amount"') // the amount key itself
    expect(serialised).not.toContain('CONFIDENTIAL-SCOPE-NOTE')

    // The context inside the payload, on its own, carries no commercial keys at all.
    const serialisedContext = JSON.stringify(payloads[0].context)
    expect(serialisedContext).not.toContain('amount')
    expect(serialisedContext).not.toContain('gst')
    expect(serialisedContext).not.toContain('margin')
    expect(serialisedContext).not.toContain('price')
    expect(serialisedContext).not.toContain('rate')
  })

  it('review items reach the payload without their amount', async () => {
    const { client, payloads } = capturingClient({ observations: [] })
    await new PromptedAiReviewProvider(client).review(standardContext())
    expect(payloads[0].context.reviewItems).toEqual([
      { kind: 'excavation', id: 'it_1', label: 'Trench for stormwater' },
    ])
  })
})

// ---------------------------------------------------------------------------
// End-to-end — fake generation output through runAiReview + M3A sanitiser
// ---------------------------------------------------------------------------

describe('M3C-1 — fake generation flows end-to-end through runAiReview', () => {
  it('successful fake generation → status completed after M3A sanitisation', async () => {
    const provider = new PromptedAiReviewProvider(capturingClient(validGeneration()).client)
    const result = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(result.status).toBe('completed')
    expect(result.error).toBeUndefined()
    expect(result.provenance).toEqual(FAKE_PROVENANCE)
    expect(result.observations).toEqual(validGeneration().observations)
  })

  it('malformed fake generation output → status invalidOutput, observations: []', async () => {
    const malformed = { observations: [{ kind: 'critical', message: 'not an allowed kind' }], verdict: 'pass' }
    const provider = new PromptedAiReviewProvider(capturingClient(malformed).client)
    const result = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(result).toEqual({
      status: 'invalidOutput',
      observations: [],
      error: { kind: 'invalidOutput', message: expect.any(String) },
    })
  })

  it('a rejecting fake client → status unavailable, observations: [], no raw error or stack exposed', async () => {
    const client: AiGenerationClient = { generate: () => Promise.reject(new Error('SECRET-CLIENT-DETAIL')) }
    const result = await runAiReview(standardRequest(), standardFlags(), new PromptedAiReviewProvider(client))
    expect(result).toEqual({
      status: 'unavailable',
      observations: [],
      error: { kind: 'providerError', message: expect.any(String) },
    })
    expect(result.error?.message).not.toContain('SECRET-CLIENT-DETAIL')
    expect(result.error?.message).not.toContain('at ') // no stack frames
    expect(result.error?.message).not.toContain('\n')
    expect(JSON.stringify(result)).not.toContain('SECRET-CLIENT-DETAIL')
  })

  it('a synchronously-throwing fake client → status unavailable, boundary resolves normally', async () => {
    const client: AiGenerationClient = {
      generate: (): Promise<unknown> => {
        throw new Error('sync client boom')
      },
    }
    const result = await runAiReview(standardRequest(), standardFlags(), new PromptedAiReviewProvider(client))
    expect(result.status).toBe('unavailable')
    expect(result.observations).toEqual([])
    expect(JSON.stringify(result)).not.toContain('sync client boom')
  })
})

// ---------------------------------------------------------------------------
// No mutation — frozen-input tests (M2C pattern)
// ---------------------------------------------------------------------------

describe('M3C-1 — the adapter does not mutate the AiReviewContext', () => {
  it('review() runs clean over the frozen context and leaves it byte-identical', async () => {
    const context = standardContext() // frozen by buildAiReviewContext
    const before = JSON.stringify(context)
    const provider = new PromptedAiReviewProvider(capturingClient(validGeneration()).client)
    await provider.review(context)
    expect(JSON.stringify(context)).toBe(before)
  })

  it('the whole path runs clean over a deep-frozen request and deep-frozen flags', async () => {
    const req = deepFreeze(standardRequest())
    const flags = deepFreeze(runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG))
    const before = JSON.stringify({ req, flags })
    const provider = new PromptedAiReviewProvider(capturingClient(validGeneration()).client)
    const result = await runAiReview(req, flags, provider)
    expect(result.status).toBe('completed')
    expect(JSON.stringify({ req, flags })).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// Determinism / stability — and the deterministic review stays untouched
// ---------------------------------------------------------------------------

describe('M3C-1 — repeated fake generation with the same context is stable', () => {
  it('same context → identical ProviderPayload, call after call', async () => {
    const context = standardContext()
    const { client, payloads } = capturingClient({ observations: [] })
    const provider = new PromptedAiReviewProvider(client)
    await provider.review(context)
    await provider.review(context)
    await provider.review(context)
    expect(payloads).toHaveLength(3)
    expect(payloads[1]).toEqual(payloads[0])
    expect(payloads[2]).toEqual(payloads[0])
    expect(JSON.stringify(payloads[1])).toBe(JSON.stringify(payloads[0]))
  })

  it('same request, flags and fake generation output → deeply identical results, run after run', async () => {
    const runOnce = () =>
      runAiReview(
        standardRequest(),
        standardFlags(),
        new PromptedAiReviewProvider(capturingClient(validGeneration()).client),
      )
    const first = await runOnce()
    for (let run = 0; run < 3; run++) {
      expect(await runOnce()).toEqual(first)
    }
    expect(first.status).toBe('completed')
  })

  it('deterministic review output is unchanged by running the prompted-provider path around it', async () => {
    const before = runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG)
    expect(before.map((f) => f.code)).toEqual(['HF-SPOIL', 'HF-SERVICES', 'RK-ACCESS'])
    const provider = new PromptedAiReviewProvider(capturingClient(validGeneration()).client)
    await runAiReview(standardRequest(), before, provider)
    const after = runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG)
    expect(after).toEqual(before)
  })
})
