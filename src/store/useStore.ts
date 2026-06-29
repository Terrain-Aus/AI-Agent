// Global app state. Persists to localStorage out of the box; swap the
// `persist` storage for the Supabase repository (see src/lib/supabase.ts)
// to go cloud without touching components.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage, JobActuals, JobSpec, Quote } from '../engine/types'
import { estimate } from '../engine/estimator'
import { DEFAULT_RATEBOOK, RateBook } from '../engine/pricing'
import { DEFAULT_BUSINESS, deriveRateBook, type BusinessProfile } from '../engine/business'
import type { BusinessIntelligence, QuoteContext, RiskInputs } from '../pipeline/types'
import { SEED_BUSINESS_INTELLIGENCE } from '../pipeline/seed'
import { emptyQuoteContext, defaultRiskInputs } from '../pipeline/defaults'
import { EMPTY_SPEC } from '../engine/apprentice'
import { uid } from '../lib/format'

/** Company identity shown on quotes/invoices (distinct from the rate-engine BusinessProfile). */
export interface CompanyProfile {
  businessName: string
  contactName: string
  abn: string
  phone: string
  email: string
  licence: string
}

export interface AuthUser {
  email: string
  name: string
}

/**
 * A pipeline quote stores only the INPUTS (QuoteContext + RiskInputs). The
 * priced results are always derived live via runPipeline(bi) so BusinessIntelligence
 * stays the single source of truth — no copy of rates is ever frozen into a quote.
 */
export interface SiteQuote {
  id: string
  title: string
  client: string
  status: 'draft' | 'validated' | 'sent'
  createdAt: number
  updatedAt: number
  context: QuoteContext
  risk: RiskInputs
}

interface AppState {
  user: AuthUser | null
  profile: CompanyProfile
  ratebook: RateBook
  business: BusinessProfile
  /** BusinessIntelligence — single source of truth for the quoting pipeline. */
  bi: BusinessIntelligence
  quotes: Quote[]
  siteQuotes: SiteQuote[]

  login: (email: string, name?: string) => void
  logout: () => void
  updateProfile: (p: Partial<CompanyProfile>) => void
  updateRatebook: (r: Partial<RateBook>) => void
  resetRatebook: () => void
  /** Update the business profile; projects rates into the engine ratebook. */
  updateBusiness: (b: Partial<BusinessProfile>) => void
  /** Replace BusinessIntelligence. Written ONLY by the BI setup screen. */
  setBusinessIntelligence: (bi: BusinessIntelligence) => void

  // --- Pipeline (site) quotes ---
  createSiteQuote: (seed?: Partial<SiteQuote>) => SiteQuote
  getSiteQuote: (id: string) => SiteQuote | undefined
  updateSiteQuote: (id: string, patch: Partial<SiteQuote>) => void
  updateSiteContext: (id: string, context: QuoteContext) => void
  updateSiteRisk: (id: string, risk: RiskInputs) => void
  deleteSiteQuote: (id: string) => void

  createQuote: (seed?: Partial<Quote>) => Quote
  getQuote: (id: string) => Quote | undefined
  updateQuote: (id: string, patch: Partial<Quote>) => void
  updateSpec: (id: string, spec: Partial<JobSpec>) => void
  addMessage: (id: string, msg: ChatMessage) => void
  updateMessage: (id: string, msgId: string, patch: Partial<ChatMessage>) => void
  runEstimate: (id: string) => void
  logActuals: (id: string, actuals: JobActuals) => void
  deleteQuote: (id: string) => void
}

const DEFAULT_PROFILE: CompanyProfile = {
  businessName: 'Terrain Contracting Co.',
  contactName: 'Site Supervisor',
  abn: '12 345 678 901',
  phone: '0400 000 000',
  email: '',
  licence: 'QBCC 000000',
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: DEFAULT_PROFILE,
      ratebook: DEFAULT_RATEBOOK,
      business: DEFAULT_BUSINESS,
      bi: SEED_BUSINESS_INTELLIGENCE,
      quotes: [],
      siteQuotes: [],

      login: (email, name) =>
        set({ user: { email, name: name || email.split('@')[0] }, profile: { ...get().profile, email: get().profile.email || email } }),
      logout: () => set({ user: null }),

      updateProfile: (p) => set({ profile: { ...get().profile, ...p } }),
      updateRatebook: (r) => set({ ratebook: { ...get().ratebook, ...r } }),
      resetRatebook: () => set({ ratebook: DEFAULT_RATEBOOK }),

      updateBusiness: (b) => {
        const business = { ...get().business, ...b }
        // Once configured, the profile is the source of truth: project its
        // rates into the flat ratebook every quote already consumes.
        const ratebook = business.configured ? deriveRateBook(business, get().ratebook) : get().ratebook
        set({ business, ratebook })
      },

      // Single writer for BusinessIntelligence (the pipeline's source of truth).
      setBusinessIntelligence: (bi) => set({ bi }),

      // --- Pipeline (site) quotes — store INPUTS only; results derived live ---
      createSiteQuote: (seed) => {
        const now = Date.now()
        const sq: SiteQuote = {
          id: uid('sq_'),
          title: seed?.title || 'Site quote',
          client: seed?.client || '',
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          context: seed?.context || emptyQuoteContext(),
          risk: seed?.risk || defaultRiskInputs(),
        }
        set({ siteQuotes: [sq, ...get().siteQuotes] })
        return sq
      },
      getSiteQuote: (id) => get().siteQuotes.find((s) => s.id === id),
      updateSiteQuote: (id, patch) =>
        set({ siteQuotes: get().siteQuotes.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s)) }),
      updateSiteContext: (id, context) =>
        set({ siteQuotes: get().siteQuotes.map((s) => (s.id === id ? { ...s, context, updatedAt: Date.now() } : s)) }),
      updateSiteRisk: (id, risk) =>
        set({ siteQuotes: get().siteQuotes.map((s) => (s.id === id ? { ...s, risk, updatedAt: Date.now() } : s)) }),
      deleteSiteQuote: (id) => set({ siteQuotes: get().siteQuotes.filter((s) => s.id !== id) }),

      createQuote: (seed) => {
        const now = Date.now()
        const q: Quote = {
          id: uid('q_'),
          title: seed?.title || 'New Quote',
          client: seed?.client || '',
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          spec: { ...EMPTY_SPEC, ...(seed?.spec || {}) },
          chat: seed?.chat || [],
          ...seed,
        }
        set({ quotes: [q, ...get().quotes] })
        return q
      },

      getQuote: (id) => get().quotes.find((q) => q.id === id),

      updateQuote: (id, patch) =>
        set({
          quotes: get().quotes.map((q) => (q.id === id ? { ...q, ...patch, updatedAt: Date.now() } : q)),
        }),

      updateSpec: (id, spec) =>
        set({
          quotes: get().quotes.map((q) =>
            q.id === id ? { ...q, spec: { ...q.spec, ...spec }, updatedAt: Date.now() } : q,
          ),
        }),

      addMessage: (id, msg) =>
        set({
          quotes: get().quotes.map((q) =>
            q.id === id ? { ...q, chat: [...q.chat, msg], updatedAt: Date.now() } : q,
          ),
        }),

      updateMessage: (id, msgId, patch) =>
        set({
          quotes: get().quotes.map((q) =>
            q.id === id ? { ...q, chat: q.chat.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) } : q,
          ),
        }),

      runEstimate: (id) => {
        const q = get().getQuote(id)
        if (!q) return
        const est = estimate(q.spec, get().ratebook)
        const title =
          q.title && q.title !== 'New Quote'
            ? q.title
            : `${q.spec.area || ''}m² ${q.spec.jobType.replace('-', ' ')}${q.spec.location ? ' · ' + q.spec.location : ''}`.trim()
        set({
          quotes: get().quotes.map((x) =>
            x.id === id ? { ...x, estimate: est, status: 'estimated', title, updatedAt: Date.now() } : x,
          ),
        })
      },

      logActuals: (id, actuals) =>
        set({
          quotes: get().quotes.map((q) =>
            q.id === id ? { ...q, actuals, status: q.status === 'lost' ? q.status : 'invoiced', updatedAt: Date.now() } : q,
          ),
        }),

      deleteQuote: (id) => set({ quotes: get().quotes.filter((q) => q.id !== id) }),
    }),
    {
      name: 'terrainpro-store',
      version: 1,
    },
  ),
)
