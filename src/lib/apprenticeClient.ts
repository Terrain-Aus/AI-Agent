// Browser-side client for the server apprentice proxy. Parses the SSE stream
// into clean ClientEvents. Knows nothing about which LLM is behind the proxy.

import type {
  ApprenticeContext,
  ApprenticeHealth,
  ClientEvent,
  PayloadMessage,
} from './apprenticeProtocol'

const STREAM_PATH = '/api/apprentice/stream'
const HEALTH_PATH = '/api/apprentice/health'

let healthCache: ApprenticeHealth | null = null

/** Whether a live server-side LLM is configured. Cached after first check. */
export async function apprenticeHealth(): Promise<ApprenticeHealth> {
  if (healthCache) return healthCache
  try {
    const res = await fetch(HEALTH_PATH)
    if (!res.ok) throw new Error(String(res.status))
    healthCache = (await res.json()) as ApprenticeHealth
  } catch {
    healthCache = { live: false, provider: 'local' }
  }
  return healthCache
}

export interface StreamHandle {
  abort: () => void
}

/**
 * POST the conversation + context and stream ClientEvents back via onEvent.
 * Resolves when the stream ends.
 */
export async function streamApprentice(
  body: { quoteId: string; messages: PayloadMessage[]; context: ApprenticeContext },
  onEvent: (ev: ClientEvent) => void,
  controllerRef?: (h: StreamHandle) => void,
): Promise<void> {
  const ctrl = new AbortController()
  controllerRef?.({ abort: () => ctrl.abort() })

  const res = await fetch(STREAM_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  })

  if (!res.ok || !res.body) {
    onEvent({ type: 'error', message: `Apprentice unavailable (${res.status})` })
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      try {
        onEvent(JSON.parse(payload) as ClientEvent)
      } catch {
        // ignore malformed frame
      }
    }
  }
}
