import { describe, it, expect } from 'vitest'
import {
  REMEDIATION_SEVERITIES,
  REMEDIATION_CATEGORIES,
  type RemediationFlag,
} from '../remediation-flag'
import { isRemediationFlag } from '../guards'

const validFlag = (over: Partial<RemediationFlag> = {}): RemediationFlag => ({
  code: 'missing-scope-note',
  severity: 'advisory',
  category: 'completeness',
  title: 'No scope note',
  detail: 'This quote has no written scope — disputes start here.',
  source: 'apprentice',
  ...over,
})

describe('RemediationFlag — contract shape', () => {
  it('accepts a minimal valid flag', () => {
    expect(isRemediationFlag(validFlag())).toBe(true)
  })

  it('accepts every declared severity and category', () => {
    for (const severity of REMEDIATION_SEVERITIES) {
      expect(isRemediationFlag(validFlag({ severity }))).toBe(true)
    }
    for (const category of REMEDIATION_CATEGORIES) {
      expect(isRemediationFlag(validFlag({ category }))).toBe(true)
    }
  })

  it('accepts optional fields when present and well-formed', () => {
    expect(
      isRemediationFlag(
        validFlag({
          suggestedAction: 'Add a scope note.',
          rationale: 'Scope disputes are the top source of write-offs.',
          target: { kind: 'quote', id: 'q_123' },
          confidence: 0.82,
        }),
      ),
    ).toBe(true)
  })

  it('rejects unknown severity / category', () => {
    expect(isRemediationFlag({ ...validFlag(), severity: 'block' })).toBe(false)
    expect(isRemediationFlag({ ...validFlag(), category: 'made-up' })).toBe(false)
  })

  it('rejects a wrong or missing source', () => {
    expect(isRemediationFlag({ ...validFlag(), source: 'foreman' })).toBe(false)
    const { source: _drop, ...noSource } = validFlag()
    void _drop
    expect(isRemediationFlag(noSource)).toBe(false)
  })

  it('rejects out-of-range confidence and malformed target', () => {
    expect(isRemediationFlag(validFlag({ confidence: 1.5 }))).toBe(false)
    expect(isRemediationFlag(validFlag({ confidence: -0.1 }))).toBe(false)
    expect(isRemediationFlag({ ...validFlag(), target: { kind: 'quote' } })).toBe(false)
  })

  it('rejects non-objects', () => {
    for (const x of [null, undefined, 42, 'flag', []]) {
      expect(isRemediationFlag(x)).toBe(false)
    }
  })
})
