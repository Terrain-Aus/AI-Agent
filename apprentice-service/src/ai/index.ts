// AI review boundary — M3A public surface plus the M3B prompt protocol, the
// M3C-1 provider adapter port and the M3C-2 real generation client. Locked
// contracts, the untrusted-output sanitiser, the post-deterministic runner,
// the provider-agnostic prompt builder, and the prompted provider adapter
// stay provider-agnostic (no SDK, no network, no environment); the one real
// provider integration lives in vertex-generation-client.ts and is injected
// through the same M3C-1 port as any fake.

export * from './contracts'
export * from './sanitise'
export * from './run-ai-review'
export * from './prompt-protocol'
export * from './provider-payload'
export * from './prompted-provider'
export * from './vertex-generation-client'
