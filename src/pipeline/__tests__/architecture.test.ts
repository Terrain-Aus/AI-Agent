// Architecture guard tests — enforce the four non-negotiable rules at the
// MODULE BOUNDARY by inspecting source, not just behaviour.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), 'src/pipeline', rel), 'utf8')

describe('Architecture — engines cannot reach around the pipeline', () => {
  it('CommercialEngine never imports the rate store / BI rates', () => {
    const src = read('commercialEngine.ts')
    // No handle to the rate store: no seed, no zustand store, no BI rate maps.
    expect(src).not.toMatch(/from ['"]\.\/seed['"]/)
    expect(src).not.toMatch(/useStore/)
    expect(src).not.toMatch(/BusinessIntelligence/)
    expect(src).not.toMatch(/plantRates|materialRates|labourRates|disposalRates/)
    // Its only inputs are RateResult, PricingPolicy and RiskInputs.
    expect(src).toMatch(/RateResult/)
    expect(src).toMatch(/PricingPolicy/)
    expect(src).toMatch(/RiskInputs/)
  })

  it('RateEngine receives rates as an argument and keeps no store', () => {
    const src = read('rateEngine.ts')
    expect(src).not.toMatch(/from ['"]\.\/seed['"]/)
    expect(src).not.toMatch(/useStore/)
    // Signature takes Rates as a parameter.
    expect(src).toMatch(/rates:\s*Rates/)
  })

  it('QuantityEngine never imports rates or money', () => {
    const src = read('quantityEngine.ts')
    expect(src).not.toMatch(/from ['"]\.\/seed['"]/)
    expect(src).not.toMatch(/\bRates\b/)
    expect(src).not.toMatch(/plantRates|materialRates/)
  })

  it('ValidationEngine signature carries no rate store', () => {
    const src = read('validationEngine.ts')
    expect(src).not.toMatch(/from ['"]\.\/seed['"]/)
    expect(src).not.toMatch(/:\s*Rates\b/)
  })
})
