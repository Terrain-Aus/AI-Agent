// Site conditions — NEW optional contract surface added in M2A.
//
// The Step 0 audit found M1 carried NO siteContext of any kind: no access
// constraints, no road reserve / footpath / verge adjacency, no wet-conditions /
// water-table indicators, and no BYDA / service-location state. This block
// closes those gaps.
//
// SEMANTIC CONTRACT — "no signal": every field is optional. A MISSING field
// (and, for the BYDA fields, the literal 'unknown') means "unknown / not
// supplied". It does NOT mean false, and it does NOT mean confirmed. Rules must
// treat "no signal" as "not confirmed" and must never read absence as a
// positive assertion either way.
//
// BYDA note: these fields record what the PRODUCER asserts about the BYDA
// (Before You Dig Australia) / service-location step. TerrainPro does NOT
// verify BYDA enquiries, service plans, or the physical location of
// underground services — it only flags whether the quote has confirmed the step.

/** Access constraint level. Closed union; absent field = unknown. */
export const ACCESS_CONSTRAINTS = ['open', 'moderate', 'restricted'] as const
export type AccessConstraint = (typeof ACCESS_CONSTRAINTS)[number]

/** BYDA / service-location workflow state, as supplied by the producer. Closed set. */
export const BYDA_STATUSES = [
  'notChecked',
  'requested',
  'plansReceived',
  'locatedOnSite',
  'notRequired',
  'unknown',
] as const
export type BydaStatus = (typeof BYDA_STATUSES)[number]

/** `bydaRequired` values: a positive yes/no assertion, or explicitly unknown. */
export const BYDA_REQUIRED_VALUES = [true, false, 'unknown'] as const
export type BydaRequired = (typeof BYDA_REQUIRED_VALUES)[number]

/**
 * Optional structured site conditions. May be partially populated — each field
 * stands alone. See the "no signal" semantic contract above.
 */
export interface SiteConditions {
  /** Access constraint. Absent = unknown. Supports RK-ACCESS. */
  access?: AccessConstraint
  /** Works abut/encroach a road reserve, footpath or verge. Supports RK-TRAFFIC. */
  roadReserveAdjacent?: boolean
  /** Wet ground / high water table / dewatering-pumping indicated. Supports RK-WATER. */
  wetConditions?: boolean
  /** Whether a BYDA enquiry is needed. Absent or 'unknown' = no signal. Supports HF-SERVICES. */
  bydaRequired?: BydaRequired
  /** Where the BYDA / service-location step stands. Absent or 'unknown' = no signal. Supports HF-SERVICES. */
  bydaStatus?: BydaStatus
}

/** Narrowing guard: is `x` a well-formed SiteConditions block? */
export function isSiteConditions(x: unknown): x is SiteConditions {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false
  const s = x as Record<string, unknown>
  if (s.access !== undefined && !(ACCESS_CONSTRAINTS as readonly string[]).includes(s.access as string)) return false
  if (s.roadReserveAdjacent !== undefined && typeof s.roadReserveAdjacent !== 'boolean') return false
  if (s.wetConditions !== undefined && typeof s.wetConditions !== 'boolean') return false
  if (s.bydaRequired !== undefined && !(BYDA_REQUIRED_VALUES as readonly unknown[]).includes(s.bydaRequired)) return false
  if (s.bydaStatus !== undefined && !(BYDA_STATUSES as readonly string[]).includes(s.bydaStatus as string)) return false
  return true
}
