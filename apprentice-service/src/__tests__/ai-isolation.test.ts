// M3A/M3C-2 — AI boundary isolation scan. The repo has no dependency-cruiser
// (or equivalent) boundary tooling, so this source-scan test (Node built-ins
// only) enforces the AI-layer isolation rules:
//
//   - The SAFE BOUNDARY FILES (M3A contracts/sanitiser/runner, M3B prompt
//     protocol, M3C-1 provider port + adapter) contain NO reference to any
//     real provider, cloud SDK, network primitive, or environment read.
//     Providers reach the boundary by INJECTION only.
//   - M3C-2 introduces exactly ONE real provider integration file,
//     vertex-generation-client.ts. It may import the official Google Gen AI
//     SDK ('@google/genai') and NOTHING else external. index.ts may re-export
//     it (an intra-package path) but may not touch the SDK itself.
//   - NOTHING in src/ai — including the real client — may use fetch(,
//     http.request, https.request, process.env, or an API key.
//   - No apprentice-service non-test source anywhere may read process.env.
//
// (The package-wide import boundary — intra-package + node: builtins, plus
// the single M3C-2 SDK exception — is separately enforced by boundary.test.ts.)

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { basename, dirname, join } from 'node:path'

const aiDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'ai') // apprentice-service/src/ai
const srcDir = join(aiDir, '..') // apprentice-service/src

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

/**
 * The provider-agnostic AI boundary files (M3A/M3B/M3C-1). These must stay
 * completely provider/cloud/network/env free — M3C-2 must not weaken them.
 */
const SAFE_BOUNDARY_FILES: readonly string[] = [
  'contracts.ts',
  'sanitise.ts',
  'run-ai-review.ts',
  'prompt-protocol.ts',
  'provider-payload.ts',
  'prompted-provider.ts',
]

/** The ONE real provider integration file M3C-2 introduces. */
const REAL_CLIENT_FILE = 'vertex-generation-client.ts'

/** Forbidden in EVERY src/ai file, including the real client and index.ts. */
const UNIVERSAL_FORBIDDEN: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'fetch(', re: /\bfetch\s*\(/ },
  { label: 'http.request', re: /\bhttp\.request\b/ },
  { label: 'https.request', re: /\bhttps\.request\b/ },
  { label: 'process.env', re: /\bprocess\.env\b/ },
  { label: 'API key usage', re: /api[-_]?key/i },
]

/** Additionally forbidden in the safe boundary files (and index.ts). */
const PROVIDER_FORBIDDEN: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'gemini', re: /gemini/i },
  { label: 'vertex', re: /vertex/i },
  { label: 'googleapis', re: /googleapis/i },
  { label: '@google/genai', re: /@google\/genai/ },
]

/** Matches import/re-export specifiers, including bare side-effect imports. */
const IMPORT_RE = /\b(?:from|import)\s+['"]([^'"]+)['"]/g

const importSpecs = (text: string): string[] => {
  const specs: string[] = []
  let m: RegExpExecArray | null
  while ((m = IMPORT_RE.exec(text)) !== null) specs.push(m[1])
  return specs
}

describe('M3A/M3C-2 — AI boundary isolation scan', () => {
  const files = walk(aiDir)
  const read = (file: string) => readFileSync(file, 'utf8')

  it('finds the AI boundary source files to scan', () => {
    expect(files.length).toBeGreaterThan(0)
    for (const safe of SAFE_BOUNDARY_FILES) {
      expect(files.some((f) => basename(f) === safe)).toBe(true)
    }
    expect(files.some((f) => basename(f) === REAL_CLIENT_FILE)).toBe(true)
    expect(files.some((f) => basename(f) === 'index.ts')).toBe(true)
  })

  it('no src/ai file — including the real client — uses fetch(, http(s).request, process.env, or an API key', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = read(file)
      for (const { label, re } of UNIVERSAL_FORBIDDEN) {
        if (re.test(text)) offenders.push(`${file.replace(aiDir, 'src/ai')} → ${label}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the safe boundary files remain provider/cloud free (no gemini/vertex/googleapis/@google/genai)', () => {
    const offenders: string[] = []
    for (const file of files) {
      if (!SAFE_BOUNDARY_FILES.includes(basename(file))) continue
      const text = read(file)
      for (const { label, re } of PROVIDER_FORBIDDEN) {
        if (re.test(text)) offenders.push(`${file.replace(aiDir, 'src/ai')} → ${label}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('index.ts only re-exports the real client by intra-package path — no SDK/provider reference of its own', () => {
    const indexFile = files.find((f) => basename(f) === 'index.ts')
    expect(indexFile).toBeDefined()
    const text = read(indexFile as string)
    // Every import/re-export in index.ts is an intra-package path.
    for (const spec of importSpecs(text)) {
      expect(spec.startsWith('./')).toBe(true)
    }
    // Beyond naming the real client module, index.ts is as clean as a safe file.
    const withoutClientName = text.split('vertex-generation-client').join('')
    for (const { label, re } of PROVIDER_FORBIDDEN) {
      expect(re.test(withoutClientName), `index.ts → ${label}`).toBe(false)
    }
  })

  it('the real client file imports @google/genai and intra-package paths only — nothing else external', () => {
    const clientFile = files.find((f) => basename(f) === REAL_CLIENT_FILE)
    expect(clientFile).toBeDefined()
    const text = read(clientFile as string)
    const specs = importSpecs(text)
    expect(specs).toContain('@google/genai')
    for (const spec of specs) {
      expect(spec === '@google/genai' || spec.startsWith('./')).toBe(true)
    }
    // The SDK is the only sanctioned integration — no other Google surface.
    expect(/googleapis/i.test(text)).toBe(false)
  })

  it('no apprentice-service non-test source reads process.env', () => {
    const offenders: string[] = []
    for (const file of walk(srcDir)) {
      if (file.includes('__tests__')) continue
      if (/\bprocess\.env\b/.test(read(file))) offenders.push(file.replace(srcDir, 'src'))
    }
    expect(offenders).toEqual([])
  })
})
