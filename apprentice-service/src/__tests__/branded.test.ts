import { describe, it, expect } from 'vitest'
import {
  reviewedAmount,
  amountValue,
  operatorId,
  operatorIdValue,
  type DeepReadonly,
} from '../branded'

describe('opaque ReviewedAmount', () => {
  it('constructs from a number and reads back the same value', () => {
    const amt = reviewedAmount(9369)
    expect(amountValue(amt)).toBe(9369)
  })
})

describe('opaque OperatorId', () => {
  it('constructs from a string and reads back the same value', () => {
    const id = operatorId('op_dave')
    expect(operatorIdValue(id)).toBe('op_dave')
  })
})

describe('DeepReadonly', () => {
  it('preserves primitives, branded opaques and literals (compile-time), and is inert at runtime', () => {
    // Compile-time: these assignments only type-check if DeepReadonly keeps the
    // primitive/branded/literal shapes intact.
    type Shape = { v: 1; amt: ReturnType<typeof reviewedAmount>; id: ReturnType<typeof operatorId>; list: number[] }
    const value: DeepReadonly<Shape> = { v: 1, amt: reviewedAmount(10), id: operatorId('x'), list: [1, 2, 3] }
    expect(value.v).toBe(1)
    expect(amountValue(value.amt)).toBe(10)
    expect(operatorIdValue(value.id)).toBe('x')
    expect([...value.list]).toEqual([1, 2, 3])
  })
})
