// RemediationFlag — the advisory output unit of the TerrainPro Apprentice guardian.
//
// A flag is a read-only observation. The guardian NEVER mutates quotes, quantities,
// pricing, RateBook, BI, Business Profile, Quote Workspace or pipeline internals.
// createRemediationFlag() is the only sanctioned way to build a flag: it enforces
// the approved category registry and the hard-floor rules.

import { isApprovedCategory, type RemediationCategory } from './categories'
import { isHardFloorCategory, type HardFloorConfig } from './hard-floor'

export const REMEDIATION_SEVERITIES = ['info', 'warning', 'critical'] as const
export type RemediationSeverity = (typeof REMEDIATION_SEVERITIES)[number]

/** Provenance of a flag. 'hardFloor' is forced for hard-floor categories. */
export const REMEDIATION_SOURCES = ['universal', 'learned', 'hardFloor'] as const
export type RemediationSource = (typeof REMEDIATION_SOURCES)[number]

/** Read-only pointer to WHAT a flag concerns. The guardian never edits the target. */
export interface RemediationTargetRef {
  kind: string
  id: string
}

export interface RemediationFlag {
  /** Stable machine code for the check. */
  code: string
  category: RemediationCategory
  severity: RemediationSeverity
  source: RemediationSource
  /** Whether the operator may dismiss this flag. Always false on the hard floor. */
  dismissible: boolean
  /** Short human-readable headline. */
  title: string
  /** Plain-language explanation. */
  detail: string
  suggestedAction?: string
  rationale?: string
  target?: RemediationTargetRef
  /** Optional model confidence in [0, 1] (populated by a later milestone's backend). */
  confidence?: number
}

/**
 * Input to the factory. `source` and `dismissible` are suggestions — the hard-floor
 * config overrides them for hard-floor categories.
 */
export interface RemediationFlagInput {
  code: string
  category: RemediationCategory
  severity: RemediationSeverity
  title: string
  detail: string
  /** Default 'universal'. Ignored (forced 'hardFloor') for hard-floor categories. */
  source?: RemediationSource
  /** Default true. Ignored (forced false) for hard-floor categories. */
  dismissible?: boolean
  suggestedAction?: string
  rationale?: string
  target?: RemediationTargetRef
  confidence?: number
}

/**
 * Build a RemediationFlag. Pure. Takes the hard-floor config explicitly.
 *
 *  - Rejects any category not in the approved registry (throws).
 *  - For any category in `hardFloorConfig`, FORCES `dismissible: false` and
 *    `source: 'hardFloor'`, regardless of what the input asked for.
 *  - Otherwise uses the input's source (default 'universal') and dismissible
 *    (default true).
 */
export function createRemediationFlag(input: RemediationFlagInput, hardFloorConfig: HardFloorConfig): RemediationFlag {
  if (!isApprovedCategory(input.category)) {
    throw new Error(`Unknown remediation category: ${String(input.category)}`)
  }

  const onHardFloor = isHardFloorCategory(hardFloorConfig, input.category)

  const flag: RemediationFlag = {
    code: input.code,
    category: input.category,
    severity: input.severity,
    source: onHardFloor ? 'hardFloor' : (input.source ?? 'universal'),
    dismissible: onHardFloor ? false : (input.dismissible ?? true),
    title: input.title,
    detail: input.detail,
  }
  if (input.suggestedAction !== undefined) flag.suggestedAction = input.suggestedAction
  if (input.rationale !== undefined) flag.rationale = input.rationale
  if (input.target !== undefined) flag.target = input.target
  if (input.confidence !== undefined) flag.confidence = input.confidence
  return flag
}
