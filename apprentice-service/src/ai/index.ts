// AI review boundary — M3A public surface plus the M3B prompt protocol.
// Locked contracts, the untrusted-output sanitiser, the post-deterministic
// runner, and the provider-agnostic prompt builder. Provider-agnostic:
// no real LLM provider, no network, no cloud SDKs — providers are injected.

export * from './contracts'
export * from './sanitise'
export * from './run-ai-review'
export * from './prompt-protocol'
