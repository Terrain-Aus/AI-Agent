import { describe, it, expect } from 'vitest'
import { SIGNAL_TIERS, type LearningProfile, type LearningProfileDelta, type SignalEvent } from '../learning'
import { operatorId } from '../branded'

const event = (over: Partial<SignalEvent> = {}): SignalEvent => ({
  category: 'spoilDisposal',
  tier: 'validated',
  code: 'spoil-uncosted',
  at: '2026-07-02T00:00:00.000Z',
  ...over,
})

describe('SignalTier', () => {
  it('is exactly habit | corrected | validated', () => {
    expect([...SIGNAL_TIERS]).toEqual(['habit', 'corrected', 'validated'])
  })
})

describe('LearningProfileDelta — append-only', () => {
  it('carries ONLY appendEvents (no update/delete/replace fields)', () => {
    const delta: LearningProfileDelta = { appendEvents: [event()] }
    expect(Object.keys(delta)).toEqual(['appendEvents'])
    // Guard against accidental widening of the contract over time.
    const forbidden = ['updateEvents', 'deleteEvents', 'replaceEvents', 'removeEvents', 'events', 'set']
    for (const key of forbidden) expect(key in delta).toBe(false)
  })

  it('appending is additive and does not mutate the source profile (test-only apply)', () => {
    const profile: LearningProfile = {
      operatorId: operatorId('op_dave'),
      profileVersion: 1,
      events: [event({ code: 'a' })],
    }
    const delta: LearningProfileDelta = { appendEvents: [event({ code: 'b' })] }

    // A test-only illustration of how a consumer would apply the delta — the
    // package itself ships NO mutation helper (contracts only).
    const applied: LearningProfile = { ...profile, events: [...profile.events, ...delta.appendEvents] }

    expect(applied.events.map((e) => e.code)).toEqual(['a', 'b'])
    expect(profile.events.map((e) => e.code)).toEqual(['a']) // source untouched
  })
})
