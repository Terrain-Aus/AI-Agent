// The Apprentice guardian contract.

import type { RemediationFlag } from './remediation-flag'
import type { GuardianReviewRequest } from './review-request'

/**
 * The guardian contract. `review()` takes a validated request and returns advisory
 * RemediationFlags. It is async because a later milestone's backend will call
 * Vertex AI Gemini Flash — but M1 ships ONLY the contract and a no-op reference
 * implementation (no AI, no network, no persistence).
 *
 * Contract guarantees — must hold for EVERY implementation:
 *   1. Resolves to an array (possibly empty) of RemediationFlag — never null/undefined.
 *   2. Never mutates the incoming request.
 *   3. Has no side effects on quotes, quantities, pricing, RateBook, BI, Business
 *      Profile, Quote Workspace or pipeline internals — it has no access to them.
 */
export interface ApprenticeGuardian {
  review(request: GuardianReviewRequest): Promise<RemediationFlag[]>
}

/**
 * M1 reference implementation: a NO-OP guardian that satisfies the contract and
 * always resolves to an empty flag list. It contains NO remediation logic and NO
 * AI — that is a later milestone. It exists so the contract is concrete, importable
 * and testable.
 */
export function createNoopGuardian(): ApprenticeGuardian {
  return {
    async review(_request: GuardianReviewRequest): Promise<RemediationFlag[]> {
      return []
    },
  }
}
