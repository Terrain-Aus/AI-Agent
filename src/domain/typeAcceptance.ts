// Compile-time acceptance tests. This file is type-checked by `tsc --strict`
// (it is NOT executed). Each `@ts-expect-error` asserts the next line MUST fail
// to compile — if it ever compiles, tsc errors on the unused directive. This is
// how the four non-negotiable rules are proven structurally.

import { qty } from './schema'
import type { Money, QuantityItem, QuoteContext, ValidatedQuoteContext } from './schema'
import { buildFinalQuote } from './validationEngine'
import { runCommercial } from './commercialEngine'

/* ── R1: a QuantityResult field cannot carry money ── */
const plain = 5 // plain number
const money: Money = 5 // Money is a number alias

// @ts-expect-error R1 — a plain number cannot be assigned into a Quantity field
const a: QuantityItem = { taskCode: 'EXC', unit: 'm3', quantity: plain, assumptions: [] }
// @ts-expect-error R1 — a Money value cannot be assigned into a Quantity field
const b: QuantityItem = { taskCode: 'EXC', unit: 'm3', quantity: money, assumptions: [] }
// qty(n) is the ONLY way in — this compiles.
const c: QuantityItem = { taskCode: 'EXC', unit: 'm3', quantity: qty(5), assumptions: [] }

/* ── R4: BuildFinalQuote cannot be called without a ValidationResult ── */
declare const draft: QuoteContext // validation may be undefined
declare const validated: ValidatedQuoteContext // validation guaranteed present

// @ts-expect-error R4 — a context without validation cannot reach the final gate
buildFinalQuote(draft)
const finalOk = buildFinalQuote(validated) // compiles — validation present

/* ── R3: RunCommercial is handed RateResult/policy/risk, never BI/RateBook ──
 * (Structural: its signature has no BI/RateBook parameter. The architecture
 * test additionally asserts the module imports neither.) */
void a
void b
void c
void finalOk
void runCommercial
