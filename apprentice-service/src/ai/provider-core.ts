// AI provider core — M3C-1. The transport-agnostic half of a real provider:
// it connects the M3B prompt protocol to an INJECTED model call and hands the
// model's reply back to the M3A boundary as untrusted output. It ships NO
// transport — no network, no cloud SDKs, no environment reads, no clock. The
// real model transport is a later milestone and arrives only through the
// `AiModelCall` seam below.
//
// ARCHITECTURE LAW (ENGINEERING.md §8, RULES.md "Boundary with future LLM
// review"): the deterministic review engine remains authoritative; this
// module adds no validation, no repair and no interpretation of model output.
// The M3A sanitiser stays the ONLY path from raw output to typed
// observations, so the provider core deliberately returns whatever the model
// said — parsed as JSON when it is JSON, verbatim otherwise — and lets the
// boundary judge it:
//
//   - transport failure (the injected call throws/rejects)  → the rejection
//     propagates, and runAiReview reports `status: 'unavailable'`;
//   - reply text that is not valid JSON, or is JSON of the wrong shape → the
//     sanitiser rejects it, and runAiReview reports `status: 'invalidOutput'`.
//
// No repair means exactly that: no trimming of prose around the JSON, no
// code-fence stripping, no retry. The prompt demands a bare JSON object; a
// reply that isn't one is invalid output, not something to fix here.

import type { AiReviewContext, AiReviewProvider } from './contracts'
import { buildAiReviewPrompt, type AiReviewPrompt } from './prompt-protocol'

/**
 * The single injection seam for a real model transport: given the built
 * prompt, return the model's raw reply text. Implementations (a later
 * milestone) own the network, credentials and model choice; the provider core
 * never sees any of that.
 */
export type AiModelCall = (prompt: AiReviewPrompt) => Promise<string>

/**
 * Parse a model's raw reply into untrusted output for the M3A sanitiser.
 * JSON text parses to its value; anything else (non-JSON text, or a
 * non-string reply from a misbehaving transport) is returned verbatim so the
 * sanitiser rejects it. Pure and deterministic; never throws.
 */
export function parseAiModelReply(reply: unknown): unknown {
  if (typeof reply !== 'string') return reply
  try {
    return JSON.parse(reply)
  } catch {
    return reply
  }
}

/**
 * Create an `AiReviewProvider` from an injected model call. Each review
 * builds the M3B prompt for the given context (already commercial-data free),
 * makes exactly one model call, and returns the parsed-but-unvalidated reply.
 * Mutates nothing; performs no I/O of its own; a rejected model call
 * propagates for runAiReview to capture as `'unavailable'`.
 */
export function createAiReviewProvider(callModel: AiModelCall): AiReviewProvider {
  return {
    async review(context: AiReviewContext): Promise<unknown> {
      const prompt = buildAiReviewPrompt(context)
      const reply = await callModel(prompt)
      return parseAiModelReply(reply)
    },
  }
}
