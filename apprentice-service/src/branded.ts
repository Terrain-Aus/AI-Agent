// Shared branded / structural type utilities for the guardian contracts.

/**
 * DeepReadonly<T> — recursively readonly. Primitives (including branded opaque
 * primitives like ReviewedAmount / OperatorId) and functions are returned as-is,
 * so branding is preserved; arrays become ReadonlyArray; objects become deeply
 * readonly.
 */
export type DeepReadonly<T> =
  T extends number | string | boolean | bigint | symbol | null | undefined
    ? T
    : T extends (...args: never[]) => unknown
      ? T
      : T extends ReadonlyArray<infer U>
        ? ReadonlyArray<DeepReadonly<U>>
        : T extends object
          ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
          : T

/* ── Opaque ReviewedAmount ────────────────────────────────────────────────
 * A money-ish amount that has passed through review. Opaque: callers cannot
 * fabricate one from a raw number without reviewedAmount(), and cannot read it
 * as a number without amountValue(). No arithmetic is exposed by the contract. */
declare const REVIEWED_AMOUNT_BRAND: unique symbol
export type ReviewedAmount = number & { readonly [REVIEWED_AMOUNT_BRAND]: 'ReviewedAmount' }

/** Construct a ReviewedAmount from a number. Pure. */
export function reviewedAmount(value: number): ReviewedAmount {
  return value as ReviewedAmount
}

/** Read the underlying number of a ReviewedAmount. Pure. */
export function amountValue(amount: ReviewedAmount): number {
  return amount
}

/* ── Opaque OperatorId ─────────────────────────────────────────────────────
 * Identifies the operator whose learning profile a review reads/extends. */
declare const OPERATOR_ID_BRAND: unique symbol
export type OperatorId = string & { readonly [OPERATOR_ID_BRAND]: 'OperatorId' }

/** Construct an OperatorId from a string. Pure. */
export function operatorId(value: string): OperatorId {
  return value as OperatorId
}

/** Read the underlying string of an OperatorId. Pure. */
export function operatorIdValue(id: OperatorId): string {
  return id
}
