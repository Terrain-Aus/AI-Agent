// AI review runner — M3A. Runs AFTER the deterministic review, never instead
// of it and never before it (ENGINEERING.md §8.1).
//
// The runner:
//   1. builds the AiReviewContext from the request — the ONLY data a provider
//      ever sees. Commercial data is excluded ENTIRELY: no totals, no rates,
//      no margins, no GST, no Business Profile, no supplier costs — and each
//      review item is copied WITHOUT its amount. The context carries defensive
//      copies (frozen), so a misbehaving provider cannot reach or mutate the
//      request, the deterministic flags, or the context itself;
//   2. calls the injected provider — provider failure is captured as a
//      `status: 'unavailable'` result, never an exception, and never leaks the
//      raw error or stack into the result;
//   3. sanitises the untrusted output all-or-nothing (see ./sanitise.ts) —
//      malformed output is a `status: 'invalidOutput'` result.
//
// It never alters the deterministic ReviewResult, never mutates any input,
// and performs no I/O of its own — the provider is injected; M3A ships no
// real provider implementation and makes no network calls.

import type { DeepReadonly } from '../branded'
import type { RemediationFlag } from '../remediation-flag'
import type { QuoteReviewRequest } from '../review-request'
import type { ReviewItem } from '../review-items'
import type { SiteConditions } from '../site-conditions'
import type { AiReviewContext, AiReviewProvider, AiReviewResult } from './contracts'
import { sanitiseAiProviderOutput } from './sanitise'

/** Safe, generic error copy — raw provider errors and stacks are never exposed. */
const PROVIDER_ERROR_MESSAGE = 'AI review provider failed; no observations were produced.'
const INVALID_OUTPUT_MESSAGE = 'AI review provider returned invalid output; no observations were accepted.'

/** Copy a review item for the AI context — amount (commercial data) excluded. */
function contextReviewItem(item: DeepReadonly<ReviewItem>): ReviewItem {
  const copy: ReviewItem = { kind: item.kind }
  if (item.id !== undefined) copy.id = item.id
  if (item.label !== undefined) copy.label = item.label
  return Object.freeze(copy)
}

/** Copy a deterministic flag so the provider never holds the trusted objects. */
function contextFlag(flag: RemediationFlag): RemediationFlag {
  const copy: RemediationFlag = { ...flag }
  if (flag.target !== undefined) copy.target = Object.freeze({ ...flag.target })
  return Object.freeze(copy)
}

/**
 * Build the AiReviewContext handed to a provider: reviewItems (amount-free
 * copies), siteConditions (copy) and the deterministic flags (copies) — and
 * nothing else. Frozen throughout. Pure; mutates nothing.
 */
export function buildAiReviewContext(
  request: QuoteReviewRequest,
  deterministicFlags: ReadonlyArray<RemediationFlag>,
): AiReviewContext {
  const context: AiReviewContext = {
    deterministicFlags: Object.freeze(deterministicFlags.map(contextFlag)),
  }
  if (request.quote.reviewItems !== undefined) {
    context.reviewItems = Object.freeze(request.quote.reviewItems.map(contextReviewItem))
  }
  if (request.siteConditions !== undefined) {
    const siteConditions: SiteConditions = { ...request.siteConditions }
    context.siteConditions = Object.freeze(siteConditions)
  }
  return Object.freeze(context)
}

/**
 * Run the advisory AI review AFTER a deterministic review. Takes the request,
 * the flags the deterministic engine emitted for it, and an INJECTED provider
 * (M3A ships none). Always resolves to an AiReviewResult — provider throws /
 * rejections and malformed output are captured as results, never re-thrown.
 */
export async function runAiReview(
  request: QuoteReviewRequest,
  deterministicFlags: ReadonlyArray<RemediationFlag>,
  provider: AiReviewProvider,
): Promise<AiReviewResult> {
  const context = buildAiReviewContext(request, deterministicFlags)

  let output: unknown
  try {
    output = await provider.review(context)
  } catch {
    return {
      status: 'unavailable',
      observations: [],
      error: { kind: 'providerError', message: PROVIDER_ERROR_MESSAGE },
    }
  }

  let sanitised
  try {
    sanitised = sanitiseAiProviderOutput(output, deterministicFlags)
  } catch {
    // The sanitiser is defensive, but exotic provider objects (throwing
    // getters, hostile proxies) must still land as a result, not an exception.
    sanitised = null
  }
  if (sanitised === null) {
    return {
      status: 'invalidOutput',
      observations: [],
      error: { kind: 'invalidOutput', message: INVALID_OUTPUT_MESSAGE },
    }
  }

  const result: AiReviewResult = { status: 'completed', observations: sanitised.observations }
  if (sanitised.provenance !== undefined) result.provenance = sanitised.provenance
  return result
}
