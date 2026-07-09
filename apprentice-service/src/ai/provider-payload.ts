// AI provider adapter port — M3C-1. LOCKED shapes: ProviderPayload and
// AiGenerationClient are the architect-approved port between the prompt
// protocol (M3B) and a future real generation client. Do not rename fields,
// add fields, or redesign them.
//
// ProviderPayload is the ONLY shape a generation client ever receives. Its
// `context` is the safe M3A AiReviewContext — already free of ALL commercial
// data (no totals, no GST, no margins, no rates, no prices, no Business
// Profile, no supplier costs, no review-item amounts, no raw quote/request
// objects, no env/config/secrets). Nothing else may be added to the payload.
//
// AiGenerationClient is a PORT, not a provider: M3C-1 ships fake/test clients
// only. It is not a client for any real model provider or cloud service —
// it imports no cloud SDKs, makes no network calls and reads no environment.
// Real clients are a later milestone; they will be injected through this
// same interface. All
// generation output is untrusted (`Promise<unknown>`) — the M3A sanitiser
// remains the only validator of provider output.

import type { AiReviewContext } from './contracts'

/** LOCKED M3C-1 payload contract. Do not rename, add or remove fields. */
export interface ProviderPayload {
  systemInstruction: string;
  userInstruction: string;
  context: AiReviewContext;
}

/**
 * The injected generation-client port. Implementations receive a
 * ProviderPayload and resolve to raw untrusted output for the M3A sanitiser.
 */
export interface AiGenerationClient {
  generate(payload: ProviderPayload): Promise<unknown>;
}
