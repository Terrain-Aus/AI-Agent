// POST /review transport adapter — M4A.
//
// A thin, framework-free adapter that exposes the EXISTING Apprentice
// deterministic review contract at a transport-safe boundary. It does exactly
// four things: match the route, validate the unknown request body with the
// existing guard, run the existing deterministic review against the default
// hard-floor config, and return the existing ReviewResult unchanged.
//
// What it deliberately is NOT:
//   - no web framework, no server/listener, no port
//   - no environment reads, no network, no I/O
//   - no persistence (no learning-profile storage — Firestore is a later milestone)
//   - no AI call of any kind — deterministic review only
//   - no new successful response wrapper: a 200 body IS the ReviewResult
//
// It never mutates the input, never creates or edits flags itself, and never
// exposes thrown errors, stack traces, or the request body in an error response.

import { isQuoteReviewRequest } from '../guards'
import { DEFAULT_HARD_FLOOR_CONFIG } from '../hard-floor'
import type { LearningProfile } from '../learning'
import { deterministicReview, type ReviewResult } from '../review'

/** The single route this adapter serves. */
export const REVIEW_ENDPOINT_PATH = '/review'

/** The single method this adapter serves. */
export const REVIEW_ENDPOINT_METHOD = 'POST'

/**
 * The transport-shaped input: whatever server wiring exists in a later
 * milestone maps its incoming request onto this. `body` is untrusted and
 * `unknown` by design — only the existing contract guard may narrow it.
 */
export interface ReviewEndpointRequest {
  readonly method: string
  readonly path: string
  readonly body: unknown
}

/** The closed set of safe error codes this adapter can return. */
export const REVIEW_ENDPOINT_ERROR_CODES = [
  'INVALID_REVIEW_REQUEST',
  'METHOD_NOT_ALLOWED',
  'NOT_FOUND',
  'REVIEW_FAILED',
] as const
export type ReviewEndpointErrorCode = (typeof REVIEW_ENDPOINT_ERROR_CODES)[number]

/** A small, safe error body: a static code and a static message — nothing else. */
export interface ReviewEndpointErrorBody {
  readonly error: {
    readonly code: ReviewEndpointErrorCode
    readonly message: string
  }
}

/** Success: HTTP-style 200 whose body IS the existing ReviewResult — no wrapper. */
export interface ReviewEndpointSuccess {
  readonly status: 200
  readonly body: ReviewResult
}

/** Failure: an HTTP-style error status with a safe static error body. */
export interface ReviewEndpointError {
  readonly status: 400 | 404 | 405 | 500
  readonly body: ReviewEndpointErrorBody
}

export type ReviewEndpointResponse = ReviewEndpointSuccess | ReviewEndpointError

const endpointError = (
  status: ReviewEndpointError['status'],
  code: ReviewEndpointErrorCode,
  message: string,
): ReviewEndpointError => ({ status, body: { error: { code, message } } })

/**
 * Handle one transport request for POST /review.
 *
 *   - wrong path            → 404 NOT_FOUND
 *   - wrong method          → 405 METHOD_NOT_ALLOWED
 *   - body fails the guard  → 400 INVALID_REVIEW_REQUEST
 *   - review throws         → 500 REVIEW_FAILED (safe static body only)
 *   - otherwise             → 200 with the deterministic ReviewResult, verbatim
 *
 * M4A has no persisted learning profile, so the review runs against an
 * in-memory EMPTY profile built from the request's operatorId. This is for
 * transport testing only: nothing is persisted, and deterministic review
 * never reads the profile anyway (its delta is always empty).
 */
export async function handleReviewEndpoint(request: ReviewEndpointRequest): Promise<ReviewEndpointResponse> {
  if (request.path !== REVIEW_ENDPOINT_PATH) {
    return endpointError(404, 'NOT_FOUND', 'Not found')
  }
  if (request.method !== REVIEW_ENDPOINT_METHOD) {
    return endpointError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
  }
  if (!isQuoteReviewRequest(request.body)) {
    return endpointError(400, 'INVALID_REVIEW_REQUEST', 'Invalid review request')
  }
  const reviewRequest = request.body
  const emptyProfile: LearningProfile = {
    operatorId: reviewRequest.operatorId,
    profileVersion: 1,
    events: [],
  }
  try {
    const body = await deterministicReview(reviewRequest, emptyProfile, DEFAULT_HARD_FLOOR_CONFIG)
    return { status: 200, body }
  } catch {
    return endpointError(500, 'REVIEW_FAILED', 'Review failed')
  }
}
