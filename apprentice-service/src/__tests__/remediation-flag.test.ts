import { describe, it, expect } from 'vitest'
import {
  REMEDIATION_SEVERITIES,
  REMEDIATION_SOURCES,
  createRemediationFlag,
  type RemediationFlagInput,
} from '../remediation-flag'
import { isRemediationFlag } from '../guards'
import { DEFAULT_HARD_FLOOR_CONFIG, createHardFloorConfig } from '../hard-floor'

const input = (over: Partial<RemediationFlagInput> = {}): RemediationFlagInput => ({
  code: 'spoil-uncosted',
  category: 'spoilDisposal',
  severity: 'critical',
  title: 'Spoil disposal not costed',
  detail: 'The dig produces spoil but nothing carts or tips it.',
  ...over,
})

describe('severities & sources', () => {
  it('severity is exactly info | warning | critical', () => {
    expect([...REMEDIATION_SEVERITIES]).toEqual(['info', 'warning', 'critical'])
  })
  it('source is exactly universal | learned | hardFloor', () => {
    expect([...REMEDIATION_SOURCES]).toEqual(['universal', 'learned', 'hardFloor'])
  })
})

describe('createRemediationFlag — hard-floor enforcement', () => {
  it('forces dismissible:false and source:hardFloor for a hard-floor category, overriding the input', () => {
    const flag = createRemediationFlag(
      input({ category: 'spoilDisposal', dismissible: true, source: 'learned' }),
      DEFAULT_HARD_FLOOR_CONFIG,
    )
    expect(flag.dismissible).toBe(false)
    expect(flag.source).toBe('hardFloor')
    expect(isRemediationFlag(flag)).toBe(true)
  })

  it('applies the hard floor to serviceProtection too (the other default)', () => {
    const flag = createRemediationFlag(input({ category: 'serviceProtection' }), DEFAULT_HARD_FLOOR_CONFIG)
    expect(flag.source).toBe('hardFloor')
    expect(flag.dismissible).toBe(false)
  })

  it('leaves a non-hard-floor category dismissible with its own source (default universal)', () => {
    const a = createRemediationFlag(input({ category: 'siteAccess' }), DEFAULT_HARD_FLOOR_CONFIG)
    expect(a.dismissible).toBe(true)
    expect(a.source).toBe('universal')
    const b = createRemediationFlag(input({ category: 'siteAccess', source: 'learned', dismissible: false }), DEFAULT_HARD_FLOOR_CONFIG)
    expect(b.source).toBe('learned')
    expect(b.dismissible).toBe(false)
  })

  it('honours a custom hard-floor config', () => {
    const cfg = createHardFloorConfig(['siteAccess'])
    const flag = createRemediationFlag(input({ category: 'siteAccess', source: 'universal', dismissible: true }), cfg)
    expect(flag.source).toBe('hardFloor')
    expect(flag.dismissible).toBe(false)
  })

  it('rejects an unknown category', () => {
    // Cast simulates untrusted/runtime data outside the registry.
    expect(() => createRemediationFlag(input({ category: 'compaction' as never }), DEFAULT_HARD_FLOOR_CONFIG)).toThrow(/unknown remediation category/i)
  })
})

describe('isRemediationFlag', () => {
  it('accepts a well-formed flag and rejects malformed ones', () => {
    const good = createRemediationFlag(input({ category: 'tipFees' }), DEFAULT_HARD_FLOOR_CONFIG)
    expect(isRemediationFlag(good)).toBe(true)
    expect(isRemediationFlag({ ...good, severity: 'advisory' })).toBe(false) // old value gone
    expect(isRemediationFlag({ ...good, source: 'apprentice' })).toBe(false) // forbidden source
    expect(isRemediationFlag({ ...good, category: 'completeness' })).toBe(false) // off-registry
    const { dismissible: _d, ...noDismissible } = good
    void _d
    expect(isRemediationFlag(noDismissible)).toBe(false)
  })
})
