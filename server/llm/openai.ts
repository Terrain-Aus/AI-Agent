// OpenAI provider built on the Responses API (/v1/responses) with streaming
// and function calling. The API key is read from the server environment and
// never leaves this process.

import type { AssistantProvider, RunArgs, ToolDef } from './types'

const ENDPOINT = 'https://api.openai.com/v1/responses'
const MAX_TOOL_ROUNDS = 5

// Responses API input items (subset we use).
type InputItem =
  | { role: 'user' | 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

interface PendingCall {
  call_id: string
  name: string
  arguments: string
}

export class OpenAIResponsesProvider implements AssistantProvider {
  readonly name = 'openai' as const
  constructor(
    private apiKey: string,
    readonly model: string,
  ) {}

  async run({ instructions, messages, tools, executeTool, emit, signal }: RunArgs): Promise<void> {
    const input: InputItem[] = messages.map((m) => ({ role: m.role, content: m.content }))
    const toolSpec = tools.map(toResponsesTool)

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const calls = await this.streamOnce(instructions, input, toolSpec, emit, signal)
        if (calls.length === 0) {
          emit({ type: 'done' })
          return
        }
        // Execute each tool call, then feed results back for the next round.
        for (const call of calls) {
          input.push({ type: 'function_call', call_id: call.call_id, name: call.name, arguments: call.arguments })
          let result: unknown
          try {
            result = await executeTool(call.name, safeParse(call.arguments))
          } catch (err) {
            result = { error: String(err) }
          }
          input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result ?? {}) })
        }
      }
      // Hit the tool-round cap — close out gracefully.
      emit({ type: 'done' })
    } catch (err) {
      emit({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  /** One streamed call; emits text deltas, returns any function calls produced. */
  private async streamOnce(
    instructions: string,
    input: InputItem[],
    tools: ReturnType<typeof toResponsesTool>[],
    emit: RunArgs['emit'],
    signal?: AbortSignal,
  ): Promise<PendingCall[]> {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        instructions,
        input,
        tools,
        parallel_tool_calls: false,
        temperature: 0.45,
        stream: true,
      }),
    })
    if (!res.ok || !res.body) {
      throw new Error(`OpenAI ${res.status}: ${await res.text().catch(() => res.statusText)}`)
    }

    const calls = new Map<string, PendingCall>()
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE frames are separated by blank lines.
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data:'))
        if (!line) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let ev: any
        try {
          ev = JSON.parse(payload)
        } catch {
          continue
        }
        handleEvent(ev, calls, emit)
      }
    }
    return [...calls.values()].filter((c) => c.name)
  }
}

function handleEvent(ev: any, calls: Map<string, PendingCall>, emit: RunArgs['emit']) {
  switch (ev.type) {
    case 'response.output_text.delta':
      if (ev.delta) emit({ type: 'text', delta: ev.delta })
      break
    case 'response.output_item.added':
      if (ev.item?.type === 'function_call') {
        calls.set(ev.item.id, { call_id: ev.item.call_id, name: ev.item.name, arguments: ev.item.arguments || '' })
      }
      break
    case 'response.function_call_arguments.delta': {
      const c = calls.get(ev.item_id)
      if (c) c.arguments += ev.delta || ''
      break
    }
    case 'response.output_item.done':
      if (ev.item?.type === 'function_call') {
        calls.set(ev.item.id, { call_id: ev.item.call_id, name: ev.item.name, arguments: ev.item.arguments || '' })
      }
      break
    case 'error':
      emit({ type: 'error', message: ev.message || 'OpenAI stream error' })
      break
    default:
      break
  }
}

function toResponsesTool(t: ToolDef) {
  // Responses API uses flat function tools (unlike Chat Completions).
  return { type: 'function' as const, name: t.name, description: t.description, parameters: t.parameters }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return s ? JSON.parse(s) : {}
  } catch {
    return {}
  }
}
