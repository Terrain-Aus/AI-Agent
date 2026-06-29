// Provider-agnostic LLM contract. Swapping vendors (OpenAI ↔ Anthropic ↔ …)
// means implementing this one interface — the orchestrator and the rest of the
// app are untouched.

import type { ClientEvent } from '../../src/lib/apprenticeProtocol'

export interface ToolDef {
  name: string
  description: string
  /** JSON Schema for the tool arguments. */
  parameters: Record<string, unknown>
}

export interface ProviderTurn {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Execute a tool the model called. Returns the JSON-serialisable result fed
 * back to the model. The executor may also push client events (e.g. a spec
 * patch or "ready" signal) via the `emit` it was created with.
 */
export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<unknown>

export interface RunArgs {
  instructions: string
  messages: ProviderTurn[]
  tools: ToolDef[]
  /** Runs an engine-backed tool and returns its result. */
  executeTool: ToolExecutor
  /** Streams a clean event to the client. */
  emit: (ev: ClientEvent) => void
  signal?: AbortSignal
}

/** A streaming chat provider that owns its own tool-call loop. */
export interface AssistantProvider {
  readonly name: 'openai' | 'mock'
  readonly model: string
  run(args: RunArgs): Promise<void>
}
