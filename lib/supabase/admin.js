
// ============================================================
//  FILE: lib/supabase/admin.js
//  SERVICE ROLE client — bypasses ALL RLS.
//  ONLY use server-side (API routes). NEVER expose to browser.
//  Use for: triggers, background jobs, admin operations.
// ============================================================
 
import { createClient } from '@supabase/supabase-js'
 
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,  // never put NEXT_PUBLIC_ on this!
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}