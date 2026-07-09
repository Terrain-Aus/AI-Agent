// Public surface of the TerrainPro Apprentice guardian service — M1 (types &
// contracts) + M2A (additive optional structured input: reviewItems, siteConditions)
// + M2B-1 (deterministic hard-floor rules: HF-SPOIL, HF-SERVICES)
// + M2B-2 (advisory site-risk rules: RK-ACCESS, RK-TRAFFIC, RK-WATER)
// + M3A (provider-agnostic AI review boundary: locked contracts, sanitiser,
//   post-deterministic runner — no real provider, no network, no LLM calls)
// + M4A (framework-free POST /review transport adapter around the existing
//   deterministic review contract — no server/listener, no port, no env reads,
//   no persistence, no AI call)
// + M4B (AI-capable POST /review adapter composing the unchanged M4A
//   deterministic adapter with the M3A runAiReview runner behind an INJECTED
//   AiReviewProvider — no real provider, no model call, no runtime config).
//
// Everything exported here is a type, a contract, a runtime guard, a pure factory,
// a pure opaque constructor/accessor, a pure deterministic rule, or a pure
// M4A/M4B transport adapter. No server, no Cloud Run, no Firestore, no LLM logic.

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
export * from './ai'
export * from './endpoint/review-endpoint'
export * from './endpoint/ai-review-endpoint'
