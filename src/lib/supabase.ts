// Supabase client — initialised only when env vars are present.
// The app runs perfectly without it (falls back to localStorage in db.ts);
// drop your VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env to switch on
// cloud auth + persistence with zero further code changes.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

/**
 * Suggested schema (run in Supabase SQL editor) — kept here as documentation
 * so the data layer is genuinely "Supabase-ready":
 *
 *   create table profiles (
 *     id uuid primary key references auth.users on delete cascade,
 *     business_name text, abn text, phone text, email text,
 *     created_at timestamptz default now()
 *   );
 *
 *   create table quotes (
 *     id uuid primary key default gen_random_uuid(),
 *     user_id uuid references auth.users on delete cascade,
 *     title text, client text, status text,
 *     spec jsonb, estimate jsonb, chat jsonb,
 *     created_at timestamptz default now(),
 *     updated_at timestamptz default now()
 *   );
 *   alter table quotes enable row level security;
 *   create policy "own quotes" on quotes
 *     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
 */
