// Global app state. Persists to localStorage out of the box; swap the
// `persist` storage for the Supabase repository (see src/lib/supabase.ts)
// to go cloud without touching components.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage, JobSpec, Quote } from '../engine/types'
import { estimate } from '../engine/estimator'
import { DEFAULT_RATEBOOK, RateBook } from '../engine/pricing'
import { EMPTY_SPEC } from '../engine/apprentice'
import { uid } from '../lib/format'

export interface BusinessProfile {
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

interface AppState {
  user: AuthUser | null
  profile: BusinessProfile
  ratebook: RateBook
  quotes: Quote[]

  login: (email: string, name?: string) => void
  logout: () => void
  updateProfile: (p: Partial<BusinessProfile>) => void
  updateRatebook: (r: Partial<RateBook>) => void
  resetRatebook: () => void

  createQuote: (seed?: Partial<Quote>) => Quote
  getQuote: (id: string) => Quote | undefined
  updateQuote: (id: string, patch: Partial<Quote>) => void
  updateSpec: (id: string, spec: Partial<JobSpec>) => void
  addMessage: (id: string, msg: ChatMessage) => void
  updateMessage: (id: string, msgId: string, patch: Partial<ChatMessage>) => void
  runEstimate: (id: string) => void
  deleteQuote: (id: string) => void
}

const DEFAULT_PROFILE: BusinessProfile = {
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
      quotes: [],

      login: (email, name) =>
        set({ user: { email, name: name || email.split('@')[0] }, profile: { ...get().profile, email: get().profile.email || email } }),
      logout: () => set({ user: null }),

      updateProfile: (p) => set({ profile: { ...get().profile, ...p } }),
      updateRatebook: (r) => set({ ratebook: { ...get().ratebook, ...r } }),
      resetRatebook: () => set({ ratebook: DEFAULT_RATEBOOK }),

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

      deleteQuote: (id) => set({ quotes: get().quotes.filter((q) => q.id !== id) }),
    }),
    {
      name: 'terrainpro-store',
      version: 1,
    },
  ),
)
