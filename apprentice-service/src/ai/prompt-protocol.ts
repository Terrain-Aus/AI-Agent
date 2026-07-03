// AI prompt protocol — M3B. Provider-agnostic: defines HOW a future provider
// asks a model for advisory observations. It does NOT call a model — no
// provider, no network, no cloud SDKs, no environment reads, no I/O.
//
// ARCHITECTURE LAW (ENGINEERING.md §8, RULES.md "Boundary with future LLM
// review"): the deterministic review engine remains authoritative. The prompt
// below makes that explicit to the model: deterministic flags already exist,
// must not be duplicated or suppressed, and AI output is advisory only —
// observations, questions and suggestions, never severity, never critical,
// never a blocking decision, never a change to quote data.
//
// Output ownership is expressed as an ALLOWLIST, mirroring the M3A sanitiser:
// the model may only output observation objects with kind, message, and
// optional relatedFlagCodes. Anything else is rejected by the sanitiser, so
// the prompt never invites it.

import type { AiReviewContext } from './contracts'

/** LOCKED M3B prompt contract. Do not rename, add or remove fields. */
export interface AiReviewPrompt {
  systemInstruction: string;
  userInstruction: string;
  context: AiReviewContext;
}

/**
 * The fixed system instruction for every AI review. A constant: the review's
 * specifics travel in the context (and the emitted-code list in the user
 * instruction), never here.
 */
const SYSTEM_INSTRUCTION = `You are the TerrainPro apprentice, an ADVISORY-ONLY second reviewer of an earthworks quote review.

A deterministic review engine has ALREADY run. It is the authoritative layer; you are secondary and advisory only, and nothing you output can override it.

Deterministic flags:
- The deterministic flags in the review context have already been emitted. They are final and authoritative.
- Do not duplicate any deterministic finding — not in the same words and not in different words.
- Do not suppress, dismiss, contradict, filter, reorder or edit any deterministic flag.
- Do not re-implement, re-derive or second-guess any deterministic check.
- You do not own any deterministic flag code and must never invent one. The ONLY way to refer to a deterministic flag is to list its already-emitted code in relatedFlagCodes.

Advisory output rules:
- You may only output observation objects with kind, message, and optional relatedFlagCodes. No other keys are allowed anywhere in your output.
- kind must be exactly one of "observation", "question" or "suggestion".
- Do not assign severity of any sort. You cannot emit critical findings.
- Do not use hard-floor language, and do not make blocking, gating, pass/fail or approval decisions.
- Do not change — or advise changing — the quote, quantities, pricing, rates, the Business Profile, the review items or the site conditions.
- Do not give pricing advice based on amounts. No commercial amounts are provided to you, and you must not infer or invent any dollar figure.
- Do not claim that BYDA enquiries, the location of services, compliance, supplier prices or site conditions have been externally verified. Nothing in the context is externally verified.
- Do not make legal or compliance claims of any kind.
- If you are unsure about something, ask a question (kind "question") instead of asserting it.

Output format — return ONLY this JSON object and nothing else:
{
  "observations": [
    {
      "kind": "observation" | "question" | "suggestion",
      "message": "plain English advisory message",
      "relatedFlagCodes": ["optional references to deterministic flags already emitted"]
    }
  ]
}
- No extra keys at any level, on any object.
- observations may be an empty array if you have nothing useful to add.`

/**
 * The user instruction preamble; the emitted-code sentence appended by the
 * builder is the only per-review variation.
 */
const USER_INSTRUCTION_BASE = `Review the attached context: the review items, the site conditions, and the deterministic flags already emitted for this quote review.

The deterministic flags are authoritative and already cover their findings. Do not repeat any of them, in any wording. Add only adjacent, useful advisory observations, questions or suggestions that the deterministic flags do not already cover. If everything useful is already flagged, return an empty observations array.`

const RESPOND_JSON_ONLY =
  'Respond with only the JSON object described in the system instruction.'

/**
 * Build the AiReviewPrompt for one review. Pure and deterministic: reads only
 * the given AiReviewContext (normally the frozen context from
 * buildAiReviewContext — already free of all commercial data), mutates
 * nothing, adds nothing to the context, and performs no I/O. Same context →
 * identical prompt, every call.
 */
export function buildAiReviewPrompt(context: AiReviewContext): AiReviewPrompt {
  const emittedCodes = context.deterministicFlags.map((flag) => flag.code)

  const codesInstruction =
    emittedCodes.length > 0
      ? `Deterministic flags already emitted in this review: ${emittedCodes.join(', ')}. relatedFlagCodes may reference only these codes.`
      : 'No deterministic flags were emitted in this review, so omit relatedFlagCodes (or leave it empty).'

  return Object.freeze({
    systemInstruction: SYSTEM_INSTRUCTION,
    userInstruction: `${USER_INSTRUCTION_BASE}\n\n${codesInstruction}\n\n${RESPOND_JSON_ONLY}`,
    context,
  })
}
