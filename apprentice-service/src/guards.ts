// Runtime contract guards — validate that untrusted values match the M1 types.
// Useful at the future transport boundary (M2) and as executable documentation of
// the contract. Pure functions, no side effects.

import { REMEDIATION_SEVERITIES, REMEDIATION_CATEGORIES, type RemediationFlag } from './remediation-flag'
import { VALIDATION_STATUSES, type GuardianReviewRequest } from './review-request'

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
const isStr = (x: unknown): x is string => typeof x === 'string'
const oneOf = (list: readonly string[], x: unknown): boolean => isStr(x) && list.includes(x)

/** Narrowing guard: is `x` a well-formed RemediationFlag? */
export function isRemediationFlag(x: unknown): x is RemediationFlag {
  if (!isObj(x)) return false
  if (!isStr(x.code) || !isStr(x.title) || !isStr(x.detail)) return false
  if (!oneOf(REMEDIATION_SEVERITIES, x.severity)) return false
  if (!oneOf(REMEDIATION_CATEGORIES, x.category)) return false
  if (x.source !== 'apprentice') return false
  if (x.suggestedAction !== undefined && !isStr(x.suggestedAction)) return false
  if (x.rationale !== undefined && !isStr(x.rationale)) return false
  if (x.confidence !== undefined && (typeof x.confidence !== 'number' || x.confidence < 0 || x.confidence > 1)) return false
  if (x.target !== undefined) {
    if (!isObj(x.target) || !isStr(x.target.kind) || !isStr(x.target.id)) return false
  }
  return true
}

/** Narrowing guard: is `x` a well-formed GuardianReviewRequest? */
export function isGuardianReviewRequest(x: unknown): x is GuardianReviewRequest {
  if (!isObj(x)) return false
  if (!isStr(x.quoteId)) return false
  if (!isObj(x.quote) || !isStr(x.quote.quoteId)) return false
  const v = x.validation
  if (!isObj(v)) return false
  if (!oneOf(VALIDATION_STATUSES, v.status)) return false
  if (!Array.isArray(v.findings)) return false
  if (x.learningProfileId !== undefined && !isStr(x.learningProfileId)) return false
  return true
}
