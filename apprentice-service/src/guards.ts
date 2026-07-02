// Runtime contract guards — validate untrusted values against the M1 contracts.
// Pure functions, no side effects. Useful at the future transport boundary and as
// executable documentation of the contracts.

import { isApprovedCategory } from './categories'
import { REMEDIATION_SEVERITIES, REMEDIATION_SOURCES, type RemediationFlag } from './remediation-flag'
import { VALIDATION_STATUSES, type QuoteReviewRequest } from './review-request'

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null
const isStr = (x: unknown): x is string => typeof x === 'string'
const oneOf = (list: readonly string[], x: unknown): boolean => isStr(x) && list.includes(x)

/** Narrowing guard: is `x` a well-formed RemediationFlag? */
export function isRemediationFlag(x: unknown): x is RemediationFlag {
  if (!isObj(x)) return false
  if (!isStr(x.code) || !isStr(x.title) || !isStr(x.detail)) return false
  if (!isApprovedCategory(x.category)) return false
  if (!oneOf(REMEDIATION_SEVERITIES, x.severity)) return false
  if (!oneOf(REMEDIATION_SOURCES, x.source)) return false
  if (typeof x.dismissible !== 'boolean') return false
  if (x.suggestedAction !== undefined && !isStr(x.suggestedAction)) return false
  if (x.rationale !== undefined && !isStr(x.rationale)) return false
  if (x.confidence !== undefined && (typeof x.confidence !== 'number' || x.confidence < 0 || x.confidence > 1)) return false
  if (x.target !== undefined) {
    if (!isObj(x.target) || !isStr(x.target.kind) || !isStr(x.target.id)) return false
  }
  return true
}

/** Narrowing guard: is `x` a well-formed QuoteReviewRequest (contract version 1)? */
export function isGuardianReviewRequest(x: unknown): x is QuoteReviewRequest {
  if (!isObj(x)) return false
  if (x.reviewContractVersion !== 1) return false
  if (!isStr(x.quoteId) || !isStr(x.operatorId)) return false
  const quote = x.quote
  if (!isObj(quote) || !isStr(quote.quoteId)) return false
  const validation = x.validation
  if (!isObj(validation) || !oneOf(VALIDATION_STATUSES, validation.status) || !Array.isArray(validation.findings)) return false
  return true
}

/** Alias reflecting the request type name. */
export const isQuoteReviewRequest = isGuardianReviewRequest
