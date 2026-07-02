// Learning contracts — append-only.
//
// The guardian may learn how an operator responds to remediation, but M1 defines
// only the SHAPES. There is no persistence here (Firestore is a later milestone),
// and the learning log is append-only: a review may emit new SignalEvents, never
// update, delete or replace existing ones.

import type { RemediationCategory } from './categories'
import type { OperatorId } from './branded'

/** How settled a signal is. */
export const SIGNAL_TIERS = ['habit', 'corrected', 'validated'] as const
export type SignalTier = (typeof SIGNAL_TIERS)[number]

/**
 * An immutable learning signal: one observation about how an operator handled a
 * remediation category. Once created it never changes.
 */
export interface SignalEvent {
  readonly category: RemediationCategory
  readonly tier: SignalTier
  /** The flag code the signal relates to. */
  readonly code: string
  /** ISO-8601 timestamp supplied by the caller. The contract only stores it. */
  readonly at: string
}

/**
 * The persisted, per-operator learning profile: an append-only event log plus its
 * version. (Persistence itself is not part of M1.)
 */
export interface LearningProfile {
  readonly operatorId: OperatorId
  /** Contract/schema version for the learning profile. */
  readonly profileVersion: 1
  /** The immutable log this profile is derived from. */
  readonly events: ReadonlyArray<SignalEvent>
}

/**
 * The APPEND-ONLY delta a review emits. It can ONLY append events — there are no
 * update, delete or replace fields, by design.
 */
export interface LearningProfileDelta {
  readonly appendEvents: ReadonlyArray<SignalEvent>
}
