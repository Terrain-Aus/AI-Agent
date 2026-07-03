// M3A — AI boundary isolation scan. The repo has no dependency-cruiser (or
// equivalent) boundary tooling, so this source-scan test (Node built-ins only)
// enforces the M3A external/provider isolation rule: the AI boundary modules
// (src/ai/) contain NO reference to any real provider, cloud SDK, network
// primitive, or environment read. Providers reach the boundary by INJECTION
// only; M3A ships no provider implementation.
//
// (The package-wide import boundary — intra-package + node: builtins only —
// is separately enforced by boundary.test.ts.)

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aiDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'ai') // apprentice-service/src/ai

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

/** Forbidden references for the AI boundary source, per the M3A milestone. */
const FORBIDDEN: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'gemini', re: /gemini/i },
  { label: 'vertex', re: /vertex/i },
  { label: 'googleapis', re: /googleapis/i },
  { label: 'fetch(', re: /\bfetch\s*\(/ },
  { label: 'http.request', re: /\bhttp\.request\b/ },
  { label: 'https.request', re: /\bhttps\.request\b/ },
  { label: 'process.env', re: /\bprocess\.env\b/ },
]

describe('M3A — AI boundary modules are provider/cloud/network free', () => {
  const files = walk(aiDir)

  it('finds the AI boundary source files to scan', () => {
    expect(files.length).toBeGreaterThan(0)
    expect(files.some((f) => f.endsWith('contracts.ts'))).toBe(true)
    expect(files.some((f) => f.endsWith('sanitise.ts'))).toBe(true)
    expect(files.some((f) => f.endsWith('run-ai-review.ts'))).toBe(true)
  })

  it('no AI boundary source references a provider, cloud SDK, network call, or environment read', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const { label, re } of FORBIDDEN) {
        if (re.test(text)) offenders.push(`${file.replace(aiDir, 'src/ai')} → ${label}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
