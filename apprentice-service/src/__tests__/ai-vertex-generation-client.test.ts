// M3C-2 — real Vertex generation client tests. The Google Gen AI SDK is
// MOCKED at the module boundary (vi.mock): no live network, no real Google
// credentials, no real model calls, no process.env reliance. Covers the
// required M3C-2 behaviours:
//
//   - VertexGenerationClient implements the M3C-1 AiGenerationClient port and
//     plugs into the existing PromptedAiReviewProvider unchanged;
//   - config (project, location, model, optional apiVersion) is injected and
//     required — nothing is hardcoded, there are no defaults, and no API key
//     is ever passed to the SDK;
//   - the SDK request is derived ONLY from the ProviderPayload (plus the
//     configured model id): systemInstruction, userInstruction and the
//     serialised safe context — and commercial data (totals, GST, margin,
//     item amount, confidential scope note) never reaches it;
//   - bare JSON model text is decoded with strict JSON.parse to unknown
//     output; malformed/non-JSON text is returned raw (no fence stripping,
//     no repair, no retry) and becomes invalidOutput through runAiReview;
//   - SDK throw/rejection becomes unavailable through runAiReview with no
//     raw SDK error or stack exposed;
//   - the client mutates nothing and deterministic review output is
//     unchanged.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { operatorId, reviewedAmount } from '../branded'
import { DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import type { ReviewItem } from '../review-items'
import type { QuoteReviewRequestShape } from '../review-request'
import { runDeterministicRules } from '../rules'
import type { SiteConditions } from '../site-conditions'

// ---------------------------------------------------------------------------
// SDK mock — the ONLY GoogleGenAI the client ever sees in tests. Captures
// constructor options and generateContent requests; behaviour per test.
// ---------------------------------------------------------------------------

const sdk = vi.hoisted(() => ({
  ctorOptions: [] as Array<Record<string, unknown>>,
  requests: [] as Array<Record<string, unknown>>,
  respond: (async () => ({ text: '{"observations":[]}' })) as (
    request: Record<string, unknown>,
  ) => Promise<unknown>,
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: (request: Record<string, unknown>) => {
        sdk.requests.push(request)
        return sdk.respond(request)
      },
    }

    constructor(options: Record<string, unknown>) {
      sdk.ctorOptions.push(options)
    }
  },
}))

import {
  PromptedAiReviewProvider,
  VertexGenerationClient,
  buildAiReviewContext,
  buildAiReviewPrompt,
  runAiReview,
  type AiGenerationClient,
  type ProviderPayload,
  type VertexGenerationClientConfig,
} from '../ai'

beforeEach(() => {
  sdk.ctorOptions.length = 0
  sdk.requests.length = 0
  sdk.respond = async () => ({ text: '{"observations":[]}' })
})

// ---------------------------------------------------------------------------
// Fixtures — injected fake config values, and a request that deliberately
// CARRIES commercial data (totals, GST, margin, item amount, confidential
// scope note) so the tests can prove none of it reaches the SDK request
// (M3C-1 pattern).
// ---------------------------------------------------------------------------

const CONFIG: VertexGenerationClientConfig = {
  project: 'test-project',
  location: 'test-location',
  model: 'test-model',
}

const request = (reviewItems?: ReviewItem[], siteConditions?: SiteConditions): QuoteReviewRequestShape => ({
  reviewContractVersion: 1,
  quoteId: 'q_m3c2',
  operatorId: operatorId('op_test'),
  quote: {
    quoteId: 'q_m3c2',
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

const standardPayload = (): ProviderPayload => {
  const context = standardContext()
  const prompt = buildAiReviewPrompt(context)
  return Object.freeze({
    systemInstruction: prompt.systemInstruction,
    userInstruction: prompt.userInstruction,
    context,
  })
}

/** Fake/mock provenance values only — no real model call happens in M3C-2 tests. */
const FAKE_PROVENANCE = { provider: 'fake-provider', model: 'fake-model-1', generatedAt: '2026-01-01T00:00:00Z' }

const validGeneration = () => ({
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

const respondWithText = (text: unknown) => {
  sdk.respond = async () => ({ text })
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}

// ---------------------------------------------------------------------------
// Port conformance — implements the M3C-1 AiGenerationClient
// ---------------------------------------------------------------------------

describe('M3C-2 — VertexGenerationClient implements AiGenerationClient', () => {
  it('is assignable to the M3C-1 AiGenerationClient port and exposes generate()', () => {
    const client: AiGenerationClient = new VertexGenerationClient(CONFIG)
    expect(typeof client.generate).toBe('function')
  })

  it('is accepted by the existing PromptedAiReviewProvider unchanged', () => {
    const provider = new PromptedAiReviewProvider(new VertexGenerationClient(CONFIG))
    expect(typeof provider.review).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// Injected config — required fields, no hardcoded values, no API key
// ---------------------------------------------------------------------------

describe('M3C-2 — config is injected and required; nothing is hardcoded', () => {
  const withField = (overrides: Record<string, unknown>) =>
    ({ ...CONFIG, ...overrides }) as unknown as VertexGenerationClientConfig

  it.each(['project', 'location', 'model'] as const)('requires a non-empty "%s"', (field) => {
    expect(() => new VertexGenerationClient(withField({ [field]: undefined }))).toThrow(field)
    expect(() => new VertexGenerationClient(withField({ [field]: '' }))).toThrow(field)
    expect(() => new VertexGenerationClient(withField({ [field]: '   ' }))).toThrow(field)
    expect(() => new VertexGenerationClient(withField({ [field]: 42 }))).toThrow(field)
  })

  it('there is no default: omitting any required field throws instead of falling back', () => {
    expect(() => new VertexGenerationClient({} as unknown as VertexGenerationClientConfig)).toThrow()
  })

  it('initialises the SDK in Vertex mode with exactly the injected project/location — no apiKey, no extras', () => {
    void new VertexGenerationClient(CONFIG)
    expect(sdk.ctorOptions).toHaveLength(1)
    expect(sdk.ctorOptions[0]).toEqual({ vertexai: true, project: 'test-project', location: 'test-location' })
    expect('apiKey' in sdk.ctorOptions[0]).toBe(false)
  })

  it('passes an injected apiVersion through, and omits the key entirely when not configured', () => {
    void new VertexGenerationClient({ ...CONFIG, apiVersion: 'v1' })
    expect(sdk.ctorOptions[0]).toEqual({
      vertexai: true,
      project: 'test-project',
      location: 'test-location',
      apiVersion: 'v1',
    })
    void new VertexGenerationClient(CONFIG)
    expect('apiVersion' in sdk.ctorOptions[1]).toBe(false)
  })

  it('different injected configs reach the SDK unchanged — values are not hardcoded', async () => {
    const a = new VertexGenerationClient({ project: 'proj-a', location: 'loc-a', model: 'model-a' })
    const b = new VertexGenerationClient({ project: 'proj-b', location: 'loc-b', model: 'model-b' })
    expect(sdk.ctorOptions[0]).toMatchObject({ project: 'proj-a', location: 'loc-a' })
    expect(sdk.ctorOptions[1]).toMatchObject({ project: 'proj-b', location: 'loc-b' })
    await a.generate(standardPayload())
    await b.generate(standardPayload())
    expect(sdk.requests[0].model).toBe('model-a')
    expect(sdk.requests[1].model).toBe('model-b')
  })
})

// ---------------------------------------------------------------------------
// SDK request mapping — derived from the ProviderPayload only
// ---------------------------------------------------------------------------

describe('M3C-2 — the SDK request is derived from the ProviderPayload only', () => {
  it('maps systemInstruction, userInstruction and the serialised safe context into ONE request — nothing else', async () => {
    const payload = standardPayload()
    await new VertexGenerationClient(CONFIG).generate(payload)

    expect(sdk.requests).toHaveLength(1)
    expect(sdk.requests[0]).toEqual({
      model: 'test-model',
      contents: [
        {
          role: 'user',
          parts: [{ text: payload.userInstruction }, { text: JSON.stringify(payload.context) }],
        },
      ],
      config: { systemInstruction: payload.systemInstruction },
    })
  })

  it('the request includes the system instruction, user instruction and serialised context verbatim', async () => {
    const payload = standardPayload()
    await new VertexGenerationClient(CONFIG).generate(payload)
    const serialised = JSON.stringify(sdk.requests[0])
    expect(serialised).toContain(JSON.stringify(payload.systemInstruction))
    expect(serialised).toContain(JSON.stringify(payload.userInstruction))
    expect(serialised).toContain(JSON.stringify(JSON.stringify(payload.context)))
  })

  it('calls generateContent exactly once per generate() — no retry, even on failure', async () => {
    sdk.respond = async () => {
      throw new Error('boom')
    }
    const client = new VertexGenerationClient(CONFIG)
    await expect(client.generate(standardPayload())).rejects.toThrow()
    expect(sdk.requests).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Commercial-data exclusion — nothing commercial reaches the SDK request
// ---------------------------------------------------------------------------

describe('M3C-2 — commercial data never reaches the SDK request', () => {
  it('totals, GST, margin, item amount and the confidential scope note are absent from the SDK request', async () => {
    const provider = new PromptedAiReviewProvider(new VertexGenerationClient(CONFIG))
    respondWithText(JSON.stringify(validGeneration()))
    const result = await runAiReview(standardRequest(), standardFlags(), provider)
    expect(result.status).toBe('completed')

    // Everything the mocked SDK received, serialised.
    const serialised = JSON.stringify(sdk.requests[0])
    expect(serialised).not.toContain('totals')
    expect(serialised).not.toContain('subtotalExGst')
    expect(serialised).not.toContain('marginPct')
    expect(serialised).not.toContain('4321.99') // subtotal ex GST
    expect(serialised).not.toContain('432.2') // GST
    expect(serialised).not.toContain('4754.19') // total
    expect(serialised).not.toContain('27.5') // margin
    expect(serialised).not.toContain('1500.5') // the review item's amount
    expect(serialised).not.toContain('\\"amount\\"') // the amount key inside the serialised context
    expect(serialised).not.toContain('CONFIDENTIAL-SCOPE-NOTE')

    // The model contents on their own carry no commercial markers either.
    const contents = JSON.stringify(sdk.requests[0].contents)
    expect(contents).not.toContain('gst')
    expect(contents).not.toContain('margin')
    expect(contents).not.toContain('price')
    expect(contents).not.toContain('CONFIDENTIAL-SCOPE-NOTE')
  })

  it('no raw quote or request object reaches the SDK request', async () => {
    const provider = new PromptedAiReviewProvider(new VertexGenerationClient(CONFIG))
    await runAiReview(standardRequest(), standardFlags(), provider)
    const serialised = JSON.stringify(sdk.requests[0])
    expect(serialised).not.toContain('"quote"')
    expect(serialised).not.toContain('"validation"')
    expect(serialised).not.toContain('operatorId')
  })
})

// ---------------------------------------------------------------------------
// Output handling — strict JSON.parse only; the sanitiser stays the validator
// ---------------------------------------------------------------------------

describe('M3C-2 — output handling is strict JSON.parse only', () => {
  it('bare JSON model text is decoded to the parsed unknown value', async () => {
    respondWithText('{"observations":[{"kind":"question","message":"Any rock expected?"}]}')
    const output = await new VertexGenerationClient(CONFIG).generate(standardPayload())
    expect(output).toEqual({ observations: [{ kind: 'question', message: 'Any rock expected?' }] })
  })

  it('non-JSON model text is returned raw and unchanged — no trimming, no repair', async () => {
    const prose = 'Here are my thoughts: the quote looks fine.'
    respondWithText(prose)
    expect(await new VertexGenerationClient(CONFIG).generate(standardPayload())).toBe(prose)
  })

  it('code-fenced JSON is NOT stripped — it comes back as the raw fenced string', async () => {
    const fenced = '```json\n{"observations":[]}\n```'
    respondWithText(fenced)
    expect(await new VertexGenerationClient(CONFIG).generate(standardPayload())).toBe(fenced)
  })

  it('a missing text body is returned as-is for the sanitiser to reject', async () => {
    sdk.respond = async () => ({}) // no text on the response
    expect(await new VertexGenerationClient(CONFIG).generate(standardPayload())).toBeUndefined()
  })

  it('valid JSON that is not the locked output shape is still returned raw for the sanitiser to reject', async () => {
    respondWithText('[1,2,3]')
    expect(await new VertexGenerationClient(CONFIG).generate(standardPayload())).toEqual([1, 2, 3])
  })
})

// ---------------------------------------------------------------------------
// End-to-end — through PromptedAiReviewProvider, runAiReview and the sanitiser
// ---------------------------------------------------------------------------

describe('M3C-2 — the real client flows end-to-end through the existing M3C-1/M3A path', () => {
  const promptedProvider = () => new PromptedAiReviewProvider(new VertexGenerationClient(CONFIG))

  it('valid JSON model text → status completed after M3A sanitisation', async () => {
    respondWithText(JSON.stringify(validGeneration()))
    const result = await runAiReview(standardRequest(), standardFlags(), promptedProvider())
    expect(result.status).toBe('completed')
    expect(result.error).toBeUndefined()
    expect(result.provenance).toEqual(FAKE_PROVENANCE)
    expect(result.observations).toEqual(validGeneration().observations)
  })

  it('malformed/non-JSON model text → status invalidOutput, observations: []', async () => {
    respondWithText('Sorry, I cannot produce JSON right now.')
    const result = await runAiReview(standardRequest(), standardFlags(), promptedProvider())
    expect(result).toEqual({
      status: 'invalidOutput',
      observations: [],
      error: { kind: 'invalidOutput', message: expect.any(String) },
    })
  })

  it('a missing text body → status invalidOutput, observations: []', async () => {
    sdk.respond = async () => ({})
    const result = await runAiReview(standardRequest(), standardFlags(), promptedProvider())
    expect(result.status).toBe('invalidOutput')
    expect(result.observations).toEqual([])
  })

  it('SDK rejection → status unavailable, observations: [], no raw SDK error or stack exposed', async () => {
    sdk.respond = async () => {
      throw new Error('VERTEX-SDK-SECRET-DETAIL: credential exchange failed')
    }
    const result = await runAiReview(standardRequest(), standardFlags(), promptedProvider())
    expect(result).toEqual({
      status: 'unavailable',
      observations: [],
      error: { kind: 'providerError', message: expect.any(String) },
    })
    expect(result.error?.message).not.toContain('VERTEX-SDK-SECRET-DETAIL')
    expect(result.error?.message).not.toContain('at ') // no stack frames
    expect(result.error?.message).not.toContain('\n')
    expect(JSON.stringify(result)).not.toContain('VERTEX-SDK-SECRET-DETAIL')
  })

  it('a synchronously-throwing SDK call → status unavailable, boundary resolves normally', async () => {
    sdk.respond = () => {
      throw new Error('sync SDK boom')
    }
    const result = await runAiReview(standardRequest(), standardFlags(), promptedProvider())
    expect(result.status).toBe('unavailable')
    expect(result.observations).toEqual([])
    expect(JSON.stringify(result)).not.toContain('sync SDK boom')
  })
})

// ---------------------------------------------------------------------------
// No mutation, determinism — and deterministic review stays untouched
// ---------------------------------------------------------------------------

describe('M3C-2 — the real client mutates nothing and deterministic review is unchanged', () => {
  it('generate() runs clean over a deep-frozen payload and leaves it byte-identical', async () => {
    const payload = deepFreeze(standardPayload())
    const before = JSON.stringify(payload)
    await new VertexGenerationClient(CONFIG).generate(payload)
    expect(JSON.stringify(payload)).toBe(before)
  })

  it('the whole path runs clean over a deep-frozen request and deep-frozen flags', async () => {
    const req = deepFreeze(standardRequest())
    const flags = deepFreeze(runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG))
    const before = JSON.stringify({ req, flags })
    respondWithText(JSON.stringify(validGeneration()))
    const result = await runAiReview(req, flags, new PromptedAiReviewProvider(new VertexGenerationClient(CONFIG)))
    expect(result.status).toBe('completed')
    expect(JSON.stringify({ req, flags })).toBe(before)
  })

  it('same payload → identical SDK requests, call after call', async () => {
    const payload = standardPayload()
    const client = new VertexGenerationClient(CONFIG)
    await client.generate(payload)
    await client.generate(payload)
    expect(sdk.requests).toHaveLength(2)
    expect(JSON.stringify(sdk.requests[1])).toBe(JSON.stringify(sdk.requests[0]))
  })

  it('deterministic review output is unchanged by running the real-client path around it', async () => {
    const before = runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG)
    expect(before.map((f) => f.code)).toEqual(['HF-SPOIL', 'HF-SERVICES', 'RK-ACCESS'])
    respondWithText(JSON.stringify(validGeneration()))
    await runAiReview(standardRequest(), before, new PromptedAiReviewProvider(new VertexGenerationClient(CONFIG)))
    const after = runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG)
    expect(after).toEqual(before)
  })
})
