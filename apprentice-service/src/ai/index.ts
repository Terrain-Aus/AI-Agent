// AI review boundary — M3A public surface. Locked contracts, the untrusted-
// output sanitiser, and the post-deterministic runner. Provider-agnostic:
// no real LLM provider, no network, no cloud SDKs — providers are injected.

export * from './contracts'
export * from './sanitise'
export * from './run-ai-review'
