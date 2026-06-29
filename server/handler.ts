// Framework-agnostic HTTP handlers (Connect-style req/res) for the apprentice
// proxy. Mounted by the Vite plugin in both dev and preview. The OpenAI key is
// read here from the server environment and never reaches the browser.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AssistantProvider } from './llm/types'
import type { ApprenticeRequest, ClientEvent } from '../src/lib/apprenticeProtocol'
import { encodeSSE } from '../src/lib/apprenticeProtocol'
import { OpenAIResponsesProvider } from './llm/openai'
import { MockProvider } from './llm/mock'
import { runApprentice } from './apprentice'

export interface ServerEnv {
  OPENAI_API_KEY?: string
  AI_PROVIDER?: string // 'openai' | 'mock' | 'local'
  AI_MODEL?: string
}

type ProviderKind = 'openai' | 'mock' | 'local'

function resolveProviderKind(env: ServerEnv): ProviderKind {
  const explicit = (env.AI_PROVIDER || '').toLowerCase()
  if (explicit === 'mock') return 'mock'
  if (explicit === 'local' || explicit === 'none') return 'local'
  if (explicit === 'openai') return env.OPENAI_API_KEY ? 'openai' : 'local'
  // Auto: use OpenAI when a key is present, otherwise fall back to on-device.
  return env.OPENAI_API_KEY ? 'openai' : 'local'
}

function makeProvider(env: ServerEnv): AssistantProvider | null {
  const kind = resolveProviderKind(env)
  const model = env.AI_MODEL || 'gpt-4o'
  if (kind === 'openai') return new OpenAIResponsesProvider(env.OPENAI_API_KEY as string, model)
  if (kind === 'mock') return new MockProvider()
  return null // 'local' → client uses the on-device apprentice
}

export function handleHealth(env: ServerEnv, res: ServerResponse) {
  const kind = resolveProviderKind(env)
  const body = JSON.stringify({ live: kind !== 'local', provider: kind, model: kind === 'openai' ? env.AI_MODEL || 'gpt-4o' : kind })
  res.statusCode = 200
  res.setHeader('content-type', 'application/json')
  res.end(body)
}

export async function handleStream(env: ServerEnv, req: IncomingMessage, res: ServerResponse) {
  const provider = makeProvider(env)

  // Set up SSE.
  res.statusCode = provider ? 200 : 503
  res.setHeader('content-type', 'text/event-stream')
  res.setHeader('cache-control', 'no-cache, no-transform')
  res.setHeader('connection', 'keep-alive')
  res.setHeader('x-apprentice-provider', provider?.name ?? 'local')

  const emit = (ev: ClientEvent) => res.write(encodeSSE(ev))

  if (!provider) {
    // No server-side LLM configured — tell the client to use on-device.
    emit({ type: 'error', message: 'No live AI provider configured; using on-device apprentice.' })
    res.end()
    return
  }

  const controller = new AbortController()
  req.on('close', () => controller.abort())

  try {
    const payload = await readJson<ApprenticeRequest>(req)
    if (!payload?.messages || !payload?.context) {
      emit({ type: 'error', message: 'Bad request: missing messages/context.' })
      res.end()
      return
    }
    await runApprentice(provider, payload, emit, controller.signal)
  } catch (err) {
    emit({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  } finally {
    res.end()
  }
}

function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1_000_000) reject(new Error('payload too large'))
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}') as T)
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}
