// M4A — POST /review transport adapter tests.
//
// The adapter is a thin boundary around EXISTING contracts: the existing guard
// validates the unknown body, the existing deterministicReview produces the
// result, and a 200 body IS the existing ReviewResult (no wrapper). These tests
// prove the transport behaviour AND that the adapter stays isolated from the
// AI runtime (no SDK import, no real client, no AI runner, no env reads).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  handleReviewEndpoint,
  REVIEW_ENDPOINT_PATH,
  REVIEW_ENDPOINT_METHOD,
  type ReviewEndpointRequest,
} from '../endpoint/review-endpoint'
import { deterministicReview } from '../review'
import { DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import { isQuoteReviewRequest, isRemediationFlag } from '../guards'
import type { LearningProfile } from '../learning'
import type { QuoteReviewRequest } from '../review-request'
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

/** A valid M2A-shaped request body carrying reviewItems + siteConditions. */
const m2aBody = () => ({
  reviewContractVersion: 1,
  quoteId: 'q_002',
  operatorId: 'op_dave',
  quote: {
    quoteId: 'q_002',
    reviewItems: [{ kind: 'excavation', label: 'Trench 20m' }],
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

const codes = (response: Awaited<ReturnType<typeof handleReviewEndpoint>>): string[] => {
  expect(response.status).toBe(200)
  if (response.status !== 200) throw new Error('unreachable')
  return response.body.flags.map((f) => f.code)
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}

// ─── success path ────────────────────────────────────────────────────────────

describe('M4A endpoint — success path', () => {
  it('POST /review with a valid M1-shaped body returns 200 and the existing ReviewResult shape', async () => {
    const response = await handleReviewEndpoint(post(m1Body()))
    expect(response.status).toBe(200)
    if (response.status !== 200) throw new Error('unreachable')
    // The body IS the ReviewResult — exactly { flags, profileDelta }, no wrapper.
    expect(Object.keys(response.body).sort()).toEqual(['flags', 'profileDelta'])
    expect(Array.isArray(response.body.flags)).toBe(true)
    // M1-shaped: no structured items / conditions → no deterministic signal.
    expect(response.body.flags).toEqual([])
    expect(response.body.profileDelta).toEqual({ appendEvents: [] })
  })

  it('POST /review with a valid M2A-shaped body returns deterministic flags', async () => {
    const response = await handleReviewEndpoint(post(m2aBody()))
    expect(response.status).toBe(200)
    if (response.status !== 200) throw new Error('unreachable')
    expect(response.body.flags.length).toBeGreaterThan(0)
    for (const flag of response.body.flags) expect(isRemediationFlag(flag)).toBe(true)
  })

  it('excavation with no spoil disposal still emits HF-SPOIL through the endpoint', async () => {
    const body = m1Body()
    ;(body.quote as Record<string, unknown>).reviewItems = [{ kind: 'excavation' }]
    const response = await handleReviewEndpoint(post(body))
    expect(codes(response)).toContain('HF-SPOIL')
  })

  it('excavation with unconfirmed services still emits HF-SERVICES through the endpoint', async () => {
    const body = m1Body()
    ;(body.quote as Record<string, unknown>).reviewItems = [
      { kind: 'excavation' },
      { kind: 'spoilDisposal' }, // satisfies HF-SPOIL so HF-SERVICES stands alone
    ]
    const response = await handleReviewEndpoint(post(body))
    const flagCodes = codes(response)
    expect(flagCodes).toContain('HF-SERVICES')
    expect(flagCodes).not.toContain('HF-SPOIL')
  })

  it('restricted access still emits RK-ACCESS through the endpoint', async () => {
    const body = m1Body()
    ;(body as Record<string, unknown>).siteConditions = { access: 'restricted' }
    const response = await handleReviewEndpoint(post(body))
    expect(codes(response)).toEqual(['RK-ACCESS'])
  })

  it('output order is stable and matches deterministic review order (registry order)', async () => {
    const response = await handleReviewEndpoint(post(m2aBody()))
    // The M2A fixture trips every registered rule; registry order is output order.
    expect(codes(response)).toEqual(['HF-SPOIL', 'HF-SERVICES', 'RK-ACCESS', 'RK-TRAFFIC', 'RK-WATER'])
    // And the whole body deep-equals a direct deterministicReview call.
    const direct = await deterministicReview(
      asContract(m2aBody()),
      emptyProfileFor('op_dave'),
      DEFAULT_HARD_FLOOR_CONFIG,
    )
    expect(response.status).toBe(200)
    if (response.status !== 200) throw new Error('unreachable')
    expect(response.body).toEqual(direct)
  })

  it('profileDelta is returned and stays append-only / empty for deterministic review', async () => {
    for (const body of [m1Body(), m2aBody()]) {
      const response = await handleReviewEndpoint(post(body))
      expect(response.status).toBe(200)
      if (response.status !== 200) throw new Error('unreachable')
      // Append-only shape: the ONLY key is appendEvents, and it is empty here.
      expect(Object.keys(response.body.profileDelta)).toEqual(['appendEvents'])
      expect(response.body.profileDelta.appendEvents).toEqual([])
    }
  })
})

// ─── error paths ─────────────────────────────────────────────────────────────

describe('M4A endpoint — error paths', () => {
  it.each([
    ['null body', null],
    ['non-object body', 'not-a-request'],
    ['empty object', {}],
    ['wrong contract version', { ...m1Body(), reviewContractVersion: 2 }],
    ['missing validation', { ...m1Body(), validation: undefined }],
    ['bad siteConditions', { ...m1Body(), siteConditions: { access: 'impossible' } }],
    ['bad reviewItems', { ...m1Body(), quote: { quoteId: 'q_001', reviewItems: [{ kind: 'nope' }] } }],
  ])('invalid body (%s) returns 400 INVALID_REVIEW_REQUEST', async (_label, body) => {
    const response = await handleReviewEndpoint(post(body))
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: { code: 'INVALID_REVIEW_REQUEST', message: 'Invalid review request' },
    })
  })

  it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'post'])(
    'wrong method (%s) on /review returns 405 METHOD_NOT_ALLOWED',
    async (method) => {
      const response = await handleReviewEndpoint({ method, path: '/review', body: m1Body() })
      expect(response.status).toBe(405)
      expect(response.body).toEqual({
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
      })
    },
  )

  it.each(['/', '/reviews', '/review/', '/Review', '/api/review', ''])(
    'wrong path (%s) returns 404 NOT_FOUND',
    async (path) => {
      const response = await handleReviewEndpoint({ method: 'POST', path, body: m1Body() })
      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } })
    },
  )

  it('error bodies never echo the request body', async () => {
    const marker = 'SECRET-QUOTE-MARKER-123'
    const response = await handleReviewEndpoint(post({ leaked: marker }))
    expect(JSON.stringify(response)).not.toContain(marker)
  })
})

// ─── purity / isolation ──────────────────────────────────────────────────────

describe('M4A endpoint — purity and isolation', () => {
  it('does not mutate the input request (deep-frozen body handles cleanly)', async () => {
    const body = deepFreeze(m2aBody())
    const request = deepFreeze({ method: 'POST', path: '/review', body })
    const before = JSON.stringify(request)
    const response = await handleReviewEndpoint(request)
    expect(response.status).toBe(200)
    expect(JSON.stringify(request)).toBe(before)
  })

  it('exposes the served route/method as constants', () => {
    expect(REVIEW_ENDPOINT_PATH).toBe('/review')
    expect(REVIEW_ENDPOINT_METHOD).toBe('POST')
  })

  it('the adapter source imports no AI runtime and reads no environment', () => {
    const endpointFile = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'endpoint',
      'review-endpoint.ts',
    )
    const text = readFileSync(endpointFile, 'utf8')
    // No SDK import, no real client, no AI runner, no provider adapter.
    expect(text).not.toContain('@google/genai')
    expect(text).not.toContain('VertexGenerationClient')
    expect(text).not.toContain('runAiReview')
    expect(text).not.toContain('PromptedAiReviewProvider')
    // No environment reads, no network primitives.
    expect(text).not.toContain('process.' + 'env')
    expect(text).not.toMatch(/\bfetch\s*\(/)
    expect(text).not.toMatch(/\bhttps?\.request\b/)
    // Every import is an intra-package relative path.
    const importRe = /\bfrom\s+['"]([^'"]+)['"]/g
    let m: RegExpExecArray | null
    let importCount = 0
    while ((m = importRe.exec(text)) !== null) {
      importCount += 1
      expect(m[1].startsWith('../')).toBe(true)
      expect(m[1].startsWith('../../')).toBe(false)
      expect(m[1].startsWith('../ai')).toBe(false)
    }
    expect(importCount).toBeGreaterThan(0)
  })

  it('deterministic review output is unchanged outside the endpoint', async () => {
    // Calling deterministicReview directly (no adapter) still yields the locked
    // registry-order flags — the adapter added no behaviour to the review itself.
    const direct = await deterministicReview(
      asContract(m2aBody()),
      emptyProfileFor('op_dave'),
      DEFAULT_HARD_FLOOR_CONFIG,
    )
    expect(direct.flags.map((f) => f.code)).toEqual([
      'HF-SPOIL',
      'HF-SERVICES',
      'RK-ACCESS',
      'RK-TRAFFIC',
      'RK-WATER',
    ])
    expect(direct.profileDelta).toEqual({ appendEvents: [] })
  })
})
