// M3B — AI prompt protocol tests. The prompt protocol is provider-agnostic
// and PURE: no model call, no provider, no network, no env, no I/O. Covers
// the required M3B behaviours:
//
//   - buildAiReviewPrompt returns the locked AiReviewPrompt shape
//     (systemInstruction, userInstruction, context — nothing else);
//   - the builder does not mutate its input;
//   - repeated calls with the same context return identical output;
//   - the prompt carries no commercial amount data;
//   - instructions allow only observation / question / suggestion kinds;
//   - model-owned deterministic flag identity is forbidden BY ALLOWLIST
//     (kind, message, optional relatedFlagCodes) — the prompt never
//     enumerates rule-identity field names;
//   - instructions state deterministic flags are authoritative and must not
//     be duplicated or suppressed;
//   - instructions forbid legal / compliance / external-verification claims;
//   - instructions never ask the model for provenance;
//   - no provider / cloud / network / env references are introduced.

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
  type AiReviewContext,
  type AiReviewPrompt,
} from '../ai'

// ---------------------------------------------------------------------------
// Fixtures — a request that deliberately CARRIES commercial data, so the
// tests can prove none of it reaches the prompt (M3A pattern).
// ---------------------------------------------------------------------------

const request = (reviewItems?: ReviewItem[], siteConditions?: SiteConditions): QuoteReviewRequestShape => ({
  reviewContractVersion: 1,
  quoteId: 'q_m3b',
  operatorId: operatorId('op_test'),
  quote: {
    quoteId: 'q_m3b',
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

const standardContext = (): AiReviewContext =>
  buildAiReviewContext(standardRequest(), runDeterministicRules(standardRequest(), DEFAULT_HARD_FLOOR_CONFIG))

const emptyContext = (): AiReviewContext => buildAiReviewContext(request(undefined, undefined), [])

/** Both instructions concatenated, for text assertions over the whole prompt. */
const instructionText = (prompt: AiReviewPrompt): string =>
  `${prompt.systemInstruction}\n${prompt.userInstruction}`

// ---------------------------------------------------------------------------
// Locked shape
// ---------------------------------------------------------------------------

describe('M3B — buildAiReviewPrompt returns the locked AiReviewPrompt shape', () => {
  it('returns exactly systemInstruction, userInstruction and context', () => {
    const prompt = buildAiReviewPrompt(standardContext())
    expect(Object.keys(prompt).sort()).toEqual(['context', 'systemInstruction', 'userInstruction'])
    expect(typeof prompt.systemInstruction).toBe('string')
    expect(typeof prompt.userInstruction).toBe('string')
    expect(prompt.systemInstruction.trim().length).toBeGreaterThan(0)
    expect(prompt.userInstruction.trim().length).toBeGreaterThan(0)
  })

  it('returns the same safe context shape it was given, unchanged', () => {
    const context = standardContext()
    const prompt = buildAiReviewPrompt(context)
    expect(prompt.context).toBe(context)
    expect(Object.keys(prompt.context).sort()).toEqual(['deterministicFlags', 'reviewItems', 'siteConditions'])
    expect(prompt.context).toEqual(standardContext())
  })

  it('the returned prompt object is frozen', () => {
    expect(Object.isFrozen(buildAiReviewPrompt(standardContext()))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Purity — no mutation, deterministic
// ---------------------------------------------------------------------------

describe('M3B — the prompt builder is pure', () => {
  it('does not mutate its input (frozen M3A context runs clean)', () => {
    const context = standardContext() // deep-frozen by buildAiReviewContext
    const before = JSON.stringify(context)
    buildAiReviewPrompt(context)
    expect(JSON.stringify(context)).toBe(before)
  })

  it('adds nothing to the context', () => {
    const context = standardContext()
    const keysBefore = Object.keys(context).sort()
    const prompt = buildAiReviewPrompt(context)
    expect(Object.keys(prompt.context).sort()).toEqual(keysBefore)
  })

  it('repeated calls with the same context return identical output', () => {
    const context = standardContext()
    const first = buildAiReviewPrompt(context)
    for (let run = 0; run < 3; run++) {
      expect(buildAiReviewPrompt(context)).toEqual(first)
    }
    // Equal contexts (fresh but identical) also produce identical prompts.
    expect(buildAiReviewPrompt(standardContext())).toEqual(first)
  })
})

// ---------------------------------------------------------------------------
// No commercial data
// ---------------------------------------------------------------------------

describe('M3B — the prompt carries no commercial amount data', () => {
  it('nothing commercial from the request survives into the serialized prompt', () => {
    const serialized = JSON.stringify(buildAiReviewPrompt(standardContext()))
    expect(serialized).not.toContain('totals')
    expect(serialized).not.toContain('gst')
    expect(serialized).not.toContain('marginPct')
    expect(serialized).not.toContain('4321.99')
    expect(serialized).not.toContain('4754.19')
    expect(serialized).not.toContain('1500.5') // the review item's amount
    expect(serialized).not.toContain('CONFIDENTIAL-SCOPE-NOTE')
    expect(serialized).not.toContain('"amount"')
  })

  it('instructions forbid pricing advice and invented dollar figures', () => {
    const text = instructionText(buildAiReviewPrompt(standardContext()))
    expect(text).toMatch(/Do not give pricing advice based on amounts/)
    expect(text).toMatch(/must not infer or invent any dollar figure/)
  })
})

// ---------------------------------------------------------------------------
// Instruction content — advisory-only, allowlist, authoritative flags
// ---------------------------------------------------------------------------

describe('M3B — prompt instructions enforce the advisory boundary', () => {
  const text = instructionText(buildAiReviewPrompt(standardContext()))

  it('allows only the observation / question / suggestion kinds', () => {
    expect(text).toMatch(/kind must be exactly one of "observation", "question" or "suggestion"/)
    expect(text).toContain('"kind": "observation" | "question" | "suggestion"')
  })

  it('requires the locked JSON output shape with no extra keys and no severity', () => {
    expect(text).toContain('"observations": [')
    expect(text).toMatch(/No extra keys at any level/)
    expect(text).toMatch(/Do not assign severity of any sort/)
    expect(text).toMatch(/cannot emit critical/)
    expect(text).toMatch(/hard-floor language/)
    expect(text).toMatch(/blocking, gating, pass\/fail or approval decisions/)
  })

  it('forbids model-owned deterministic flag identity BY ALLOWLIST', () => {
    expect(text).toMatch(
      /may only output observation objects with kind, message, and optional relatedFlagCodes/,
    )
    expect(text).toMatch(/must never invent one/)
    expect(text).toMatch(/ONLY way to refer to a deterministic flag is to list its already-emitted code in relatedFlagCodes/)
    // Allowlist wording only — the prompt never enumerates rule-identity
    // field names (no id / code / severity / category field lists, and none
    // of the forbidden identifier spellings).
    expect(text).not.toMatch(/\bruleId\b/)
    expect(text).not.toMatch(/\brule_id\b/)
    expect(text).not.toMatch(/\bdismissible\b/)
  })

  it('states deterministic flags are authoritative and already emitted', () => {
    expect(text).toMatch(/deterministic review engine has ALREADY run/i)
    expect(text).toMatch(/authoritative/)
    expect(text).toMatch(/have already been emitted/)
  })

  it('tells the model not to duplicate or suppress deterministic flags', () => {
    expect(text).toMatch(/Do not duplicate any deterministic finding/)
    expect(text).toMatch(/not in the same words and not in different words/)
    expect(text).toMatch(/Do not suppress, dismiss, contradict, filter, reorder or edit any deterministic flag/)
    expect(text).toMatch(/Do not repeat any of them, in any wording/)
    expect(text).toMatch(/adjacent, useful advisory observations, questions or suggestions/)
  })

  it('forbids quote / pricing / profile / input mutation', () => {
    expect(text).toMatch(
      /Do not change — or advise changing — the quote, quantities, pricing, rates, the Business Profile, the review items or the site conditions/,
    )
  })

  it('forbids legal, compliance and external-verification claims', () => {
    expect(text).toMatch(/Do not make legal or compliance claims of any kind/)
    expect(text).toMatch(
      /Do not claim that BYDA enquiries, the location of services, compliance, supplier prices or site conditions have been externally verified/,
    )
    expect(text).toMatch(/Nothing in the context is externally verified/)
  })

  it('tells the model to ask a question when unsure, instead of asserting', () => {
    expect(text).toMatch(/If you are unsure about something, ask a question \(kind "question"\) instead of asserting it/)
  })

  it('never asks the model for provenance', () => {
    expect(text).not.toMatch(/provenance/i)
    expect(text).not.toMatch(/\bmodel name\b/i)
    expect(text).not.toMatch(/generatedAt/)
  })
})

// ---------------------------------------------------------------------------
// Emitted-code guidance in the user instruction
// ---------------------------------------------------------------------------

describe('M3B — relatedFlagCodes guidance follows the emitted flags', () => {
  it('lists exactly the codes emitted in the current review', () => {
    const prompt = buildAiReviewPrompt(standardContext())
    expect(prompt.userInstruction).toContain(
      'Deterministic flags already emitted in this review: HF-SPOIL, HF-SERVICES, RK-ACCESS.',
    )
    expect(prompt.userInstruction).toMatch(/relatedFlagCodes may reference only these codes/)
  })

  it('with no emitted flags, tells the model to omit relatedFlagCodes', () => {
    const prompt = buildAiReviewPrompt(emptyContext())
    expect(prompt.userInstruction).toMatch(/No deterministic flags were emitted in this review/)
    expect(prompt.userInstruction).toMatch(/omit relatedFlagCodes/)
    expect(prompt.userInstruction).not.toContain('HF-SPOIL')
  })
})

// ---------------------------------------------------------------------------
// No provider / cloud / network / env references
// ---------------------------------------------------------------------------

describe('M3B — the prompt protocol introduces no provider/cloud/network/env references', () => {
  // The src/ai source files themselves are scanned by ai-isolation.test.ts
  // (which now covers prompt-protocol.ts automatically). This locks the same
  // guarantee onto the generated prompt TEXT.
  const FORBIDDEN: ReadonlyArray<RegExp> = [
    /gemini/i,
    /vertex/i,
    /googleapis/i,
    /\bfetch\s*\(/,
    /\bhttp\.request\b/,
    /\bhttps\.request\b/,
    /\bprocess\.env\b/,
    /cloud run/i,
    /firestore/i,
    /api[ _-]?key/i,
    /secret/i,
  ]

  it('generated prompt text is provider/cloud/network/env free', () => {
    for (const context of [standardContext(), emptyContext()]) {
      const text = instructionText(buildAiReviewPrompt(context))
      for (const re of FORBIDDEN) {
        expect(text).not.toMatch(re)
      }
    }
  })
})
