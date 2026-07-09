// Prompted provider adapter — M3C-1. Implements the existing M3A
// AiReviewProvider on top of an INJECTED AiGenerationClient, proving the safe
// provider-adapter path without any real provider:
//
//   AiReviewContext → buildAiReviewPrompt(context) → ProviderPayload
//     → injected AiGenerationClient → raw unknown output
//
// The adapter is a thin, pure mapping layer. It does NOT sanitise, parse,
// repair or interpret the generation output — the raw unknown result flows
// back to runAiReview(), where the M3A sanitiser remains the ONLY validator
// of provider output. It never mutates the context, reads no environment,
// makes no network calls and imports no provider/cloud SDKs — the generation
// client is injected; M3C-1 ships fakes only.

import type { AiReviewContext, AiReviewProvider } from './contracts'
import { buildAiReviewPrompt } from './prompt-protocol'
import type { AiGenerationClient, ProviderPayload } from './provider-payload'

/**
 * Provider adapter: builds the M3B prompt for the given safe context, maps it
 * into a ProviderPayload, hands the payload to the injected generation client
 * and returns the client's raw untrusted output unchanged.
 */
export class PromptedAiReviewProvider implements AiReviewProvider {
  private readonly client: AiGenerationClient

  constructor(client: AiGenerationClient) {
    this.client = client
  }

  async review(context: AiReviewContext): Promise<unknown> {
    const prompt = buildAiReviewPrompt(context)
    const payload: ProviderPayload = Object.freeze({
      systemInstruction: prompt.systemInstruction,
      userInstruction: prompt.userInstruction,
      context: prompt.context,
    })
    return this.client.generate(payload)
  }
}
