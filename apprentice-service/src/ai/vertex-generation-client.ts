// Real Vertex generation client — M3C-2. The ONE real provider integration
// file in the AI layer: it implements the LOCKED M3C-1 AiGenerationClient
// port on top of the official Google Gen AI SDK (@google/genai) in
// Vertex mode. No other src/ai module may reference the SDK, and this module
// may import nothing external except the SDK (enforced by the isolation and
// boundary scans).
//
// Configuration is INJECTED only: project, location and model are required
// constructor config with no defaults and no fallbacks — nothing is
// hardcoded, no environment is read, and no secrets or key material appear
// here. The SDK is initialised in Vertex mode (project/location); credential
// resolution is the SDK's own Google Cloud application-credentials flow at
// call time. Server-side only.
//
// Output handling is deliberately dumb (ENGINEERING.md §8.1/§8.5 — the M3A
// sanitiser remains the ONLY validator of provider output):
//   - a string response body is decoded with strict JSON.parse only; the
//     parsed unknown value is returned as-is;
//   - if JSON.parse fails, the raw text is returned unchanged — no code-fence
//     stripping, no prose trimming, no retry, no repair, no schema
//     correction, no fallback observations — so runAiReview()/the sanitiser
//     classify it (invalidOutput);
//   - a missing/non-string response body is returned as-is for the same
//     reason;
//   - SDK throws/rejections propagate to runAiReview(), which maps them to
//     status 'unavailable' with a safe generic message.
//
// The client never builds or touches RemediationFlags, never mutates the
// payload or its context, and sends ONLY data derived from the
// ProviderPayload (whose context is the safe M3A AiReviewContext — already
// free of all commercial data) plus the configured model id.

import { GoogleGenAI, type GoogleGenAIOptions } from '@google/genai'
import type { AiGenerationClient, ProviderPayload } from './provider-payload'

/**
 * Injected configuration for the real Vertex generation client. All values
 * come from the caller (server-side wiring) — never from this package, never
 * from the environment, never from a default.
 */
export interface VertexGenerationClientConfig {
  project: string;
  location: string;
  model: string;
  apiVersion?: string;
}

/** Require a non-empty string config field; there are no defaults. */
function requiredConfigString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`VertexGenerationClient config requires a non-empty "${field}"`)
  }
  return value
}

/**
 * Real AiGenerationClient backed by the official Google Gen AI SDK in Vertex
 * mode. Receives a ProviderPayload (and nothing else), maps its
 * systemInstruction, userInstruction and serialised safe context into one SDK
 * generation request, and returns the raw untrusted output for M3A
 * sanitisation.
 */
export class VertexGenerationClient implements AiGenerationClient {
  private readonly model: string
  private readonly sdk: GoogleGenAI

  constructor(config: VertexGenerationClientConfig) {
    const project = requiredConfigString(config.project, 'project')
    const location = requiredConfigString(config.location, 'location')
    this.model = requiredConfigString(config.model, 'model')

    const options: GoogleGenAIOptions = { vertexai: true, project, location }
    if (config.apiVersion !== undefined) {
      options.apiVersion = requiredConfigString(config.apiVersion, 'apiVersion')
    }
    this.sdk = new GoogleGenAI(options)
  }

  async generate(payload: ProviderPayload): Promise<unknown> {
    const response = await this.sdk.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: payload.userInstruction },
            { text: JSON.stringify(payload.context) },
          ],
        },
      ],
      config: { systemInstruction: payload.systemInstruction },
    })

    const text = response.text
    if (typeof text !== 'string') return text
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
}
