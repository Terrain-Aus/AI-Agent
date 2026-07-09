// Dependency-boundary guard: proves apprentice-service is ISOLATED.
//
// The guardian service must not reach into the host app (no ../../, no /src/, no
// '@/' alias, no bare third-party runtime deps). It may only import: intra-package
// relative paths, node: builtins, — in test files — 'vitest', and — in the single
// M3C-2 real provider integration file src/ai/vertex-generation-client.ts only —
// the official Google Gen AI SDK '@google/genai'. This test scans the package
// source and fails if anything escapes the boundary.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..') // apprentice-service/src

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

const IMPORT_RE = /\bfrom\s+['"]([^'"]+)['"]/g

describe('dependency boundary — apprentice-service is isolated', () => {
  const files = walk(srcDir)

  it('finds package source files to scan', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('imports nothing outside the package (no app / parent / bare-dep imports)', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      let m: RegExpExecArray | null
      while ((m = IMPORT_RE.exec(text)) !== null) {
        const spec = m[1]
        const intraPackage = spec.startsWith('./') || (spec.startsWith('../') && !spec.startsWith('../../'))
        const nodeBuiltin = spec.startsWith('node:')
        const vitestInTest = spec === 'vitest' && file.includes('__tests__')
        // M3C-2: the ONE real provider integration file may import the
        // official Google Gen AI SDK. Nothing else may.
        const genAiSdk =
          spec === '@google/genai' && file.endsWith(join('ai', 'vertex-generation-client.ts'))
        if (intraPackage || nodeBuiltin || vitestInTest || genAiSdk) continue
        offenders.push(`${file.replace(srcDir, 'src')} → "${spec}"`)
      }
    }
    expect(offenders).toEqual([])
  })
})
