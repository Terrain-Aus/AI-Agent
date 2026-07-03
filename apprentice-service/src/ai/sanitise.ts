// AI provider output sanitiser — M3A.
//
// ALL provider output is untrusted (`Promise<unknown>`). This module is the
// only path from raw provider output to typed AiObservations, and it is
// ALL-OR-NOTHING: if any single observation (or the provenance block, or the
// top-level shape) is invalid, the ENTIRE output is rejected. No partial
// filtering, no repair.
//
// Ownership is enforced by a strict key ALLOWLIST, not a denylist: an
// observation may carry `kind`, `message` and `relatedFlagCodes` — nothing
// else. Any other key (an id, a code, a rule identifier in any spelling, a
// severity, a category, a dismissible flag, a source, or anything unforeseen)
// rejects the whole output. This is how the boundary guarantees the AI can
// never smuggle a deterministic RemediationFlag code — or any parallel
// identity — into its observations.
//
// `relatedFlagCodes` is a reference, not ownership: every code listed must be
// present among the deterministic flags EMITTED IN THE CURRENT REVIEW (not
// merely known to the registry). Referencing a code the deterministic engine
// did not just emit is a validation failure.
//
// Pure and deterministic: structured input only, no I/O, no environment
// reads, no network, no clock, no randomness.

import type { RemediationFlag } from '../remediation-flag'
import type { AiObservation, AiObservationKind, AiReviewProvenance } from './contracts'

/** Runtime list of the closed AiObservationKind union, for validation. */
const AI_OBSERVATION_KINDS: readonly AiObservationKind[] = ['observation', 'question', 'suggestion']

/** The ONLY keys provider output may carry, per level. Anything else rejects. */
const ALLOWED_OUTPUT_KEYS: readonly string[] = ['observations', 'provenance']
const ALLOWED_OBSERVATION_KEYS: readonly string[] = ['kind', 'message', 'relatedFlagCodes']
const ALLOWED_PROVENANCE_KEYS: readonly string[] = ['provider', 'model', 'generatedAt']

/**
 * ISO 8601 date-time, e.g. 2026-01-01T00:00:00Z / with millis / with offset.
 * A structural check only — deliberately clock-free and deterministic.
 */
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/

/** The validated, re-built (never provider-referenced) content of a valid output. */
export interface SanitisedAiOutput {
  observations: AiObservation[]
  provenance?: AiReviewProvenance
}

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)

const isNonEmptyString = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0

const hasOnlyAllowedKeys = (o: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(o).every((key) => allowed.includes(key))

/** Validate one untrusted observation against the codes emitted in this review. */
function sanitiseObservation(x: unknown, emittedCodes: ReadonlySet<string>): AiObservation | null {
  if (!isPlainObject(x)) return null
  if (!hasOnlyAllowedKeys(x, ALLOWED_OBSERVATION_KEYS)) return null
  if (!(AI_OBSERVATION_KINDS as readonly unknown[]).includes(x.kind)) return null
  if (!isNonEmptyString(x.message)) return null

  const observation: AiObservation = { kind: x.kind as AiObservationKind, message: x.message }

  if ('relatedFlagCodes' in x) {
    const codes = x.relatedFlagCodes
    if (!Array.isArray(codes)) return null
    const validated: string[] = []
    for (const code of codes) {
      if (typeof code !== 'string') return null
      if (!emittedCodes.has(code)) return null
      validated.push(code)
    }
    observation.relatedFlagCodes = validated
  }

  return observation
}

/** Validate an untrusted provenance block. M3A values are fake/mock only. */
function sanitiseProvenance(x: unknown): AiReviewProvenance | null {
  if (!isPlainObject(x)) return null
  if (!hasOnlyAllowedKeys(x, ALLOWED_PROVENANCE_KEYS)) return null
  if (!isNonEmptyString(x.provider) || !isNonEmptyString(x.model)) return null
  if (typeof x.generatedAt !== 'string' || !ISO_8601_RE.test(x.generatedAt)) return null
  return { provider: x.provider, model: x.model, generatedAt: x.generatedAt }
}

/**
 * Validate raw provider output against the M3A sanitiser rules. Returns the
 * re-built observations (and provenance, when supplied) on full validity, or
 * `null` when ANYTHING is invalid — the caller maps `null` to a whole-result
 * `'invalidOutput'`. Never throws on any input shape.
 */
export function sanitiseAiProviderOutput(
  output: unknown,
  deterministicFlags: ReadonlyArray<RemediationFlag>,
): SanitisedAiOutput | null {
  if (!isPlainObject(output)) return null
  if (!hasOnlyAllowedKeys(output, ALLOWED_OUTPUT_KEYS)) return null
  if (!Array.isArray(output.observations)) return null

  const emittedCodes = new Set(deterministicFlags.map((flag) => flag.code))

  const observations: AiObservation[] = []
  for (const raw of output.observations) {
    const observation = sanitiseObservation(raw, emittedCodes)
    if (observation === null) return null
    observations.push(observation)
  }

  const result: SanitisedAiOutput = { observations }

  if ('provenance' in output) {
    const provenance = sanitiseProvenance(output.provenance)
    if (provenance === null) return null
    result.provenance = provenance
  }

  return result
}
