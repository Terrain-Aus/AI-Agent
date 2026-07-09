// POST /review AI-capable transport adapter — M4B.
//
// Composes the EXISTING pieces, adding no behaviour of its own:
//
//   M4A handleReviewEndpoint (deterministic review, unchanged)
//     → M3A runAiReview (post-deterministic, advisory-only)
//       → an INJECTED AiReviewProvider (M4B ships none)
//         → 200 body: { flags, profileDelta, aiReview }
//
// The deterministic layer stays first and stays authoritative: route/method/
// body validation and the deterministic review are exactly M4A — any M4A error
// response is returned unchanged and the provider is never called. Only after
// a deterministic 200 does runAiReview run, and its result is ADDITIVE: the
// success body is the existing ReviewResult plus an `aiReview` field. The
// existing ReviewResult type and the deterministic-only handleReviewEndpoint
// are untouched.
//
// AI failure is NOT an endpoint failure. runAiReview captures provider throws/
// rejections as `status: 'unavailable'` and malformed output as
// `status: 'invalidOutput'` — both still return 200 with the deterministic
// result intact and `observations: []`. Only route/body/deterministic-internal
// failures use the M4A error responses.
//
// What it deliberately is NOT:
//   - no real provider — no SDK import, no real generation client, no prompted
//     provider adapter, no payload/client ports; injection is the ONLY path in
//   - no environment reads, no network, no I/O, no runtime config
//   - no server/listener, no port, no Cloud Run, no Firestore

import type { AiReviewProvider, AiReviewResult } from '../ai/contracts'
import { runAiReview } from '../ai/run-ai-review'
import { isQuoteReviewRequest } from '../guards'
import type { ReviewResult } from '../review'
import {
  handleReviewEndpoint,
  type ReviewEndpointError,
  type ReviewEndpointRequest,
} from './review-endpoint'

/**
 * Success: HTTP-style 200 whose body is the existing deterministic
 * ReviewResult (`flags`, `profileDelta`) plus the advisory `aiReview` result.
 * Additive to this handler only — ReviewResult itself is unchanged.
 */
export interface ReviewEndpointWithAiSuccess {
  readonly status: 200
  readonly body: ReviewResult & { readonly aiReview: AiReviewResult }
}

/** Failure: exactly the M4A error responses, preserved unchanged. */
export type ReviewEndpointWithAiResponse = ReviewEndpointWithAiSuccess | ReviewEndpointError

const REVIEW_FAILED: ReviewEndpointError = {
  status: 500,
  body: { error: { code: 'REVIEW_FAILED', message: 'Review failed' } },
}

/**
 * Handle one transport request for POST /review with an advisory AI layer.
 *
 *   - M4A error (404/405/400/500)   → returned unchanged; provider NEVER called
 *   - deterministic 200 + provider  → 200 { flags, profileDelta, aiReview }
 *   - provider throws/rejects       → still 200; aiReview.status 'unavailable'
 *   - provider output malformed     → still 200; aiReview.status 'invalidOutput'
 *   - unexpected composition throw  → safe static 500 REVIEW_FAILED
 *
 * The provider is INJECTED by the caller — this milestone wires no real
 * provider and performs no model call.
 */
export async function handleReviewEndpointWithAi(
  request: ReviewEndpointRequest,
  provider: AiReviewProvider,
): Promise<ReviewEndpointWithAiResponse> {
  const deterministic = await handleReviewEndpoint(request)
  if (deterministic.status !== 200) {
    return deterministic
  }
  try {
    // A deterministic 200 means the guard already accepted request.body, so
    // this narrowing cannot fail; it exists for type safety, not re-validation.
    if (!isQuoteReviewRequest(request.body)) {
      return REVIEW_FAILED
    }
    const aiReview = await runAiReview(request.body, deterministic.body.flags, provider)
    return { status: 200, body: { ...deterministic.body, aiReview } }
  } catch {
    return REVIEW_FAILED
  }
}
