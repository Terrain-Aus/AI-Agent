// M3A — AI review boundary tests. Fake/mock providers ONLY: no real LLM, no
// network, no cloud SDKs. Covers the required M3A behaviours:
//
//   - the boundary runs with an INJECTED fake provider;
//   - valid output → 'completed' with the validated observations;
//   - malformed output → 'invalidOutput', observations: [], all-or-nothing;
//   - provider throw/rejection → 'unavailable', safe generic message, and the
//     boundary itself never throws;
//   - deterministic flags are passed to the provider as readable context;
//   - commercial data (totals, amounts, GST, margin) never reaches the context;
//   - ownership fields (id / code / rule identifiers / severity / category /
//     dismissible / source) in provider output reject the whole result;
//   - relatedFlagCodes validates against the flags EMITTED in the current
//     review (incl. HF-SERVICES-NOT-REQUIRED-ASSERTED when present);
//   - no mutation of request, flags or context (frozen-input, M2C-style);
//   - repeated review with the same fake output is stable and deterministic.

import { describe, it, expect } from 'vitest'
import { operatorId, reviewedAmount } from '../branded'
import { DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import type { ReviewItem } from '../review-items'
import type { QuoteReviewRequestShape } from '../review-request'
import { runDeterministicRules } from '../rules'
import type { SiteConditions } from '../site-conditions'
import {
  buildAiReviewContext,
  runAiReview,
  sanitiseAiProviderOutput,
  type AiReviewContext,
  type AiReviewProvider,
} from '../ai'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A request that deliberately CARRIES commercial data (totals, item amounts,
 * scope note) so the tests can prove none of it reaches the AI context. */
const request = (reviewItems?: ReviewItem[], siteConditions?: SiteConditions): QuoteReviewRequestShape => ({
  reviewContractVersion: 1,
  quoteId: 'q_m3a',
  operatorId: operatorId('op_test'),
  quote: {
    quoteId: 'q_m3a',
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

/** Not-required scenario → HF-SPOIL, HF-SERVICES-NOT-REQUIRED-ASSERTED. */
const notRequiredRequest = () => request([{ ...EXCAVATION_ITEM }], { bydaRequired: false })
const notRequiredFlags = () => runDeterministicRules(notRequiredRequest(), DEFAULT_HARD_FLOOR_CONFIG)

const providerReturning = (output: unknown): AiReviewProvider => ({
  review: () => Promise.resolve(output),
})

const capturingProvider = (output: unknown): { provider: AiReviewProvider; calls: AiReviewContext[] } => {
  const calls: AiReviewContext[] = []
  return {
    calls,
    provider: {
      review: (context) => {
        calls.push(context)
        return Promise.resolve(output)
      },
    },
  }
}

/** Fake/mock provenance values only — no real provider exists in M3A. */
const FAKE_PROVENANCE = { provider: 'fake-provider', model: 'fake-model-1', generatedAt: '2026-01-01T00:00:00Z' }

const validOutput = () => ({
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
// Happy path — injected fake provider, valid output
// ---------------------------------------------------------------------------

describe('M3A — AI boundary with an injected fake provider', () => {
  it('valid fake output → status completed with the validated observations and provenance', async () => {
    const result = await runAiReview(standardRequest(), standardFlags(), providerReturning(validOutput()))
    expect(result.status).toBe('completed')
    expect(result.error).toBeUndefined()
    expect(result.provenance).toEqual(FAKE_PROVENANCE)
    expect(result.observations).toEqual(validOutput().observations)
  })

  it('calls the injected provider exactly once, with the built context', async () => {
    const { provider, calls } = capturingProvider(validOutput())
    await runAiReview(standardRequest(), standardFlags(), provider)
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0]).sort()).toEqual(['deterministicFlags', 'reviewItems', 'siteConditions'])
  })

  it('an empty observations array is valid → completed with no observations', async () => {
    const result = await runAiReview(standardRequest(), standardFlags(), providerReturning({ observations: [] }))
    expect(result).toEqual({ status: 'completed', observations: [] })
  })

  it('provenance is optional — valid observations without it still complete', async () => {
    const output = { observations: [{ kind: 'question', message: 'Any overhead powerlines on site?' }] }
    const result = await runAiReview(standardRequest(), standardFlags(), providerReturning(output))
    expect(result.status).toBe('completed')
    expect(result.provenance).toBeUndefined()
  })

  it('returned observations are re-built by the sanitiser, never provider references', async () => {
    const output = validOutput()
    const result = await runAiReview(standardRequest(), standardFlags(), providerReturning(output))
    expect(result.observations[0]).not.toBe(output.observations[0])
    expect(result.observations[0].relatedFlagCodes).not.toBe(output.observations[0].relatedFlagCodes)
  })
})

// ---------------------------------------------------------------------------
// Context — deterministic flags readable; commercial data excluded
// ---------------------------------------------------------------------------

describe('M3A — AiReviewContext content', () => {
  it('deterministic flags are passed to the provider and are readable by it', async () => {
    const flags = standardFlags()
    let seenCodes: string[] = []
    const provider: AiReviewProvider = {
      review: (context) => {
        seenCodes = context.deterministicFlags.map((f) => f.code)
        return Promise.resolve({ observations: [] })
      },
    }
    await runAiReview(standardRequest(), flags, provider)
    expect(seenCodes).toEqual(['HF-SPOIL', 'HF-SERVICES', 'RK-ACCESS'])
    // Full flag content is readable (deep-equal copies of the real flags).
    const context = buildAiReviewContext(standardRequest(), flags)
    expect(context.deterministicFlags).toEqual(flags)
  })

  it('the context carries ONLY reviewItems, siteConditions and deterministicFlags — no commercial data', () => {
    const context = buildAiReviewContext(standardRequest(), standardFlags())
    expect(Object.keys(context).sort()).toEqual(['deterministicFlags', 'reviewItems', 'siteConditions'])
    const serialized = JSON.stringify(context)
    expect(serialized).not.toContain('totals')
    expect(serialized).not.toContain('gst')
    expect(serialized).not.toContain('marginPct')
    expect(serialized).not.toContain('4321.99')
    expect(serialized).not.toContain('4754.19')
    expect(serialized).not.toContain('1500.5') // the review item's amount
    expect(serialized).not.toContain('CONFIDENTIAL-SCOPE-NOTE')
    expect(serialized).not.toContain('amount')
  })

  it('review items are copied into the context without their amount', () => {
    const context = buildAiReviewContext(standardRequest(), standardFlags())
    expect(context.reviewItems).toEqual([{ kind: 'excavation', id: 'it_1', label: 'Trench for stormwater' }])
  })

  it('absent reviewItems / siteConditions stay absent (M1-shaped request)', () => {
    const context = buildAiReviewContext(request(undefined, undefined), [])
    expect(Object.keys(context)).toEqual(['deterministicFlags'])
    expect(context.deterministicFlags).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Malformed output — all-or-nothing 'invalidOutput'
// ---------------------------------------------------------------------------

const INVALID_RESULT = {
  status: 'invalidOutput',
  observations: [],
  error: { kind: 'invalidOutput', message: expect.any(String) },
}

const VALID_OBSERVATION = { kind: 'observation', message: 'A valid advisory note.' }

describe('M3A — malformed provider output is rejected whole (invalidOutput)', () => {
  const MALFORMED: ReadonlyArray<{ name: string; output: unknown }> = [
    { name: 'null output', output: null },
    { name: 'string output', output: 'observations' },
    { name: 'number output', output: 42 },
    { name: 'array output', output: [VALID_OBSERVATION] },
    { name: 'missing observations key', output: {} },
    { name: 'observations not an array', output: { observations: { 0: VALID_OBSERVATION } } },
    { name: 'unexpected top-level key', output: { observations: [], verdict: 'pass' } },
    { name: 'observation not an object', output: { observations: ['note'] } },
    { name: 'invalid kind (severity-like)', output: { observations: [{ kind: 'critical', message: 'x' }] } },
    { name: 'invalid kind (empty)', output: { observations: [{ kind: '', message: 'x' }] } },
    { name: 'missing message', output: { observations: [{ kind: 'observation' }] } },
    { name: 'empty message', output: { observations: [{ kind: 'observation', message: '' }] } },
    { name: 'whitespace-only message', output: { observations: [{ kind: 'observation', message: '   ' }] } },
    { name: 'non-string message', output: { observations: [{ kind: 'observation', message: 7 }] } },
    { name: 'forbidden field: id', output: { observations: [{ ...VALID_OBSERVATION, id: 'obs-1' }] } },
    { name: 'forbidden field: code', output: { observations: [{ ...VALID_OBSERVATION, code: 'AI-001' }] } },
    { name: 'forbidden field: ruleId', output: { observations: [{ ...VALID_OBSERVATION, ruleId: 'r1' }] } },
    { name: 'forbidden field: rule_id', output: { observations: [{ ...VALID_OBSERVATION, rule_id: 'r1' }] } },
    { name: 'forbidden field: severity', output: { observations: [{ ...VALID_OBSERVATION, severity: 'info' }] } },
    { name: 'forbidden field: category', output: { observations: [{ ...VALID_OBSERVATION, category: 'siteAccess' }] } },
    { name: 'forbidden field: dismissible', output: { observations: [{ ...VALID_OBSERVATION, dismissible: true }] } },
    { name: 'forbidden field: source', output: { observations: [{ ...VALID_OBSERVATION, source: 'universal' }] } },
    { name: 'unknown extra field', output: { observations: [{ ...VALID_OBSERVATION, confidence: 0.9 }] } },
    {
      name: 'relatedFlagCodes wrong type (string)',
      output: { observations: [{ ...VALID_OBSERVATION, relatedFlagCodes: 'RK-ACCESS' }] },
    },
    {
      name: 'relatedFlagCodes wrong element type',
      output: { observations: [{ ...VALID_OBSERVATION, relatedFlagCodes: ['RK-ACCESS', 5] }] },
    },
    { name: 'provenance not an object', output: { observations: [], provenance: 'fake' } },
    {
      name: 'provenance missing model',
      output: { observations: [], provenance: { provider: 'fake-provider', generatedAt: FAKE_PROVENANCE.generatedAt } },
    },
    {
      name: 'provenance generatedAt not ISO 8601',
      output: { observations: [], provenance: { ...FAKE_PROVENANCE, generatedAt: 'yesterday' } },
    },
    {
      name: 'provenance unexpected key',
      output: { observations: [], provenance: { ...FAKE_PROVENANCE, temperature: 0.2 } },
    },
  ]

  for (const { name, output } of MALFORMED) {
    it(`rejects: ${name}`, async () => {
      const result = await runAiReview(standardRequest(), standardFlags(), providerReturning(output))
      expect(result).toEqual(INVALID_RESULT)
    })
  }

  it('a deterministic RemediationFlag code as an observation field (code: HF-SPOIL) is rejected', async () => {
    const output = { observations: [{ ...VALID_OBSERVATION, code: 'HF-SPOIL' }] }
    const result = await runAiReview(standardRequest(), standardFlags(), providerReturning(output))
    expect(result).toEqual(INVALID_RESULT)
  })

  it('validation is all-or-nothing: one invalid observation rejects the whole result', async () => {
    const output = {
      observations: [
        { kind: 'observation', message: 'Perfectly valid.', relatedFlagCodes: ['HF-SPOIL'] },
        { kind: 'suggestion', message: 'Also valid.' },
        { kind: 'observation', message: '' }, // invalid
      ],
    }
    const result = await runAiReview(standardRequest(), standardFlags(), providerReturning(output))
    expect(result).toEqual(INVALID_RESULT)
    expect(result.observations).toEqual([])
  })

  it('exotic provider objects (throwing getters) are captured as invalidOutput, not thrown', async () => {
    const hostile = {
      observations: [
        Object.defineProperty({ kind: 'observation' }, 'message', {
          enumerable: true,
          get() {
            throw new Error('hostile getter')
          },
        }),
      ],
    }
    const result = await runAiReview(standardRequest(), standardFlags(), providerReturning(hostile))
    expect(result).toEqual(INVALID_RESULT)
  })
})

// ---------------------------------------------------------------------------
// relatedFlagCodes — reference-only, validated against the CURRENT review
// ---------------------------------------------------------------------------

describe('M3A — relatedFlagCodes validates against the flags emitted in the current review', () => {
  it('referencing an emitted code is accepted', async () => {
    const output = {
      observations: [{ kind: 'observation', message: 'Note on the spoil flag.', relatedFlagCodes: ['HF-SPOIL', 'RK-ACCESS'] }],
    }
    const result = await runAiReview(standardRequest(), standardFlags(), providerReturning(output))
    expect(result.status).toBe('completed')
    expect(result.observations[0].relatedFlagCodes).toEqual(['HF-SPOIL', 'RK-ACCESS'])
  })

  it('referencing a REAL registry code that was NOT emitted in this review is rejected', async () => {
    // RK-WATER exists in the deterministic registry but is not emitted for the
    // standard scenario — referencing it must still fail.
    const output = { observations: [{ kind: 'observation', message: 'Wet ground note.', relatedFlagCodes: ['RK-WATER'] }] }
    const result = await runAiReview(standardRequest(), standardFlags(), providerReturning(output))
    expect(result).toEqual(INVALID_RESULT)
  })

  it('referencing an invented code is rejected', async () => {
    const output = { observations: [{ ...VALID_OBSERVATION, relatedFlagCodes: ['ZZ-MADE-UP'] }] }
    const result = await runAiReview(standardRequest(), standardFlags(), providerReturning(output))
    expect(result).toEqual(INVALID_RESULT)
  })

  it('HF-SERVICES-NOT-REQUIRED-ASSERTED is referenceable exactly when emitted', async () => {
    const output = () => ({
      observations: [
        {
          kind: 'question',
          message: 'The operator marked BYDA as not required — was that intentional for this trench?',
          relatedFlagCodes: ['HF-SERVICES-NOT-REQUIRED-ASSERTED'],
        },
      ],
    })

    // Emitted in the not-required scenario → accepted.
    const flags = notRequiredFlags()
    expect(flags.map((f) => f.code)).toContain('HF-SERVICES-NOT-REQUIRED-ASSERTED')
    const accepted = await runAiReview(notRequiredRequest(), flags, providerReturning(output()))
    expect(accepted.status).toBe('completed')
    expect(accepted.observations[0].relatedFlagCodes).toEqual(['HF-SERVICES-NOT-REQUIRED-ASSERTED'])

    // Not emitted in the standard scenario → rejected.
    const rejected = await runAiReview(standardRequest(), standardFlags(), providerReturning(output()))
    expect(rejected).toEqual(INVALID_RESULT)
  })
})

// ---------------------------------------------------------------------------
// Provider failure — 'unavailable', safe messages, boundary never throws
// ---------------------------------------------------------------------------

describe('M3A — provider failure is captured, never thrown', () => {
  const UNAVAILABLE_RESULT = {
    status: 'unavailable',
    observations: [],
    error: { kind: 'providerError', message: expect.any(String) },
  }

  it('a rejecting provider → unavailable, with no raw error or stack in the message', async () => {
    const provider: AiReviewProvider = { review: () => Promise.reject(new Error('SECRET-INTERNAL-DETAIL')) }
    const result = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(result).toEqual(UNAVAILABLE_RESULT)
    expect(result.error?.message).not.toContain('SECRET-INTERNAL-DETAIL')
    expect(result.error?.message).not.toContain('at ') // no stack frames
    expect(result.error?.message).not.toContain('\n')
  })

  it('a synchronously-throwing provider → unavailable, boundary resolves normally', async () => {
    const provider: AiReviewProvider = {
      review: (): Promise<unknown> => {
        throw new Error('sync boom')
      },
    }
    const result = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(result).toEqual(UNAVAILABLE_RESULT)
    expect(result.error?.message).not.toContain('sync boom')
  })

  it('a provider rejecting with a non-Error value → unavailable', async () => {
    const provider: AiReviewProvider = { review: () => Promise.reject('raw string failure') }
    const result = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(result).toEqual(UNAVAILABLE_RESULT)
    expect(result.error?.message).not.toContain('raw string failure')
  })
})

// ---------------------------------------------------------------------------
// No mutation — frozen-input tests (M2C pattern)
// ---------------------------------------------------------------------------

describe('M3A — the AI boundary mutates nothing', () => {
  it('runs clean over a deep-frozen request and deep-frozen deterministic flags', async () => {
    const req = deepFreeze(standardRequest())
    const flags = deepFreeze(runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG))
    const before = JSON.stringify({ req, flags })
    const result = await runAiReview(req, flags, providerReturning(validOutput()))
    expect(result.status).toBe('completed')
    expect(JSON.stringify({ req, flags })).toBe(before)
  })

  it('a provider that tries to mutate the context fails against the frozen context and mutates nothing', async () => {
    const req = deepFreeze(standardRequest())
    const flags = deepFreeze(runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG))
    const before = JSON.stringify({ req, flags })
    const hostile: AiReviewProvider = {
      review: (context) => {
        // Strict mode: every one of these writes throws against the frozen context.
        ;(context as { deterministicFlags: unknown }).deterministicFlags = []
        return Promise.resolve({ observations: [] })
      },
    }
    const result = await runAiReview(req, flags, hostile)
    expect(result.status).toBe('unavailable') // the hostile write threw inside the provider
    expect(JSON.stringify({ req, flags })).toBe(before)
  })

  it('a provider mutating the copied flag objects cannot reach the real deterministic flags', async () => {
    const flags = runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG)
    const before = JSON.stringify(flags)
    const hostile: AiReviewProvider = {
      review: (context) => {
        const first = context.deterministicFlags[0] as { title: string }
        try {
          first.title = 'tampered'
        } catch {
          // frozen copy — write rejected; either way the real flags stay intact
        }
        return Promise.resolve({ observations: [] })
      },
    }
    const result = await runAiReview(standardRequest(), flags, hostile)
    expect(result.status).toBe('completed')
    expect(JSON.stringify(flags)).toBe(before)
    expect(flags[0].title).not.toBe('tampered')
  })
})

// ---------------------------------------------------------------------------
// Determinism / stability
// ---------------------------------------------------------------------------

describe('M3A — repeated review with the same fake output is stable', () => {
  it('same request, flags and provider output → deeply identical results, run after run', async () => {
    const first = await runAiReview(standardRequest(), standardFlags(), providerReturning(validOutput()))
    for (let run = 0; run < 3; run++) {
      const again = await runAiReview(standardRequest(), standardFlags(), providerReturning(validOutput()))
      expect(again).toEqual(first)
    }
    expect(first.status).toBe('completed')
  })

  it('sanitiser is pure: same output and flags → same validated result', () => {
    const flags = standardFlags()
    const first = sanitiseAiProviderOutput(validOutput(), flags)
    const second = sanitiseAiProviderOutput(validOutput(), flags)
    expect(second).toEqual(first)
    expect(first).not.toBeNull()
  })

  it('the deterministic engine output is unchanged by running the AI boundary around it', async () => {
    const before = runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG)
    await runAiReview(standardRequest(), before, providerReturning(validOutput()))
    const after = runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG)
    expect(after).toEqual(before)
  })
})
