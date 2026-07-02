// The approved RemediationCategory registry.
//
// This is a CLOSED set. Categories outside this list are rejected by the guards
// and by createRemediationFlag(). Adding a new category is a deliberate edit to
// this file — nothing else may introduce one.

export const REMEDIATION_CATEGORIES = [
  'spoilDisposal',
  'serviceProtection',
  'siteAccess',
  'trafficManagement',
  'dewatering',
  'compactionTesting',
  'reinstatement',
  'mobilisation',
  'weatherAllowance',
  'tipFees',
  'permitsAndFees',
  'plantFloat',
] as const

export type RemediationCategory = (typeof REMEDIATION_CATEGORIES)[number]

/** Runtime guard: is `x` a category in the approved registry? */
export function isApprovedCategory(x: unknown): x is RemediationCategory {
  return typeof x === 'string' && (REMEDIATION_CATEGORIES as readonly string[]).includes(x)
}
