// Repository — the only seam between the engine and storage. The engine is
// DB-agnostic: swap this in-memory stub for a Postgres/Supabase-backed repo
// implementing the same interface and nothing in the engine changes.

import type { BIRepository, BusinessIntelligence } from './types'

export class InMemoryBIRepository implements BIRepository {
  constructor(private profiles: Record<string, BusinessIntelligence>) {}
  getProfile(contractorId: string): BusinessIntelligence {
    const p = this.profiles[contractorId]
    if (!p) throw new Error(`No BusinessIntelligence profile for contractor "${contractorId}"`)
    return p
  }
}
