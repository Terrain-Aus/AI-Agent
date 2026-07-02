// Public surface of the TerrainPro Apprentice guardian service — M1 (types &
// contracts) + M2A (additive optional structured input: reviewItems, siteConditions)
// + M2B-1 (deterministic hard-floor rules: HF-SPOIL, HF-SERVICES).
//
// Everything exported here is a type, a contract, a runtime guard, a pure factory,
// a pure opaque constructor/accessor, or a pure deterministic rule. No routes, no
// Cloud Run, no Firestore, no Vertex AI / Gemini, no LLM logic.

export * from './categories'
export * from './branded'
export * from './hard-floor'
export * from './remediation-flag'
export * from './review-items'
export * from './site-conditions'
export * from './review-request'
export * from './learning'
export * from './review'
export * from './rules'
export * from './guards'
