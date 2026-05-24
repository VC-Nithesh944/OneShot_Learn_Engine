// lib/supabase/client.js
// ─────────────────────────────────────────────
//  BROWSER-SIDE Supabase client
//  Use this in Client Components ('use client')
//  This uses the ANON key — RLS protects the data.
// ─────────────────────────────────────────────
import { createBrowserClient } from '@supabase/ssr'
 
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}