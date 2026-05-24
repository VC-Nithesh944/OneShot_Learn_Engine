// ============================================================
//  FILE: lib/supabase/server.js
//  SERVER-SIDE Supabase client (API routes, Server Components)
//  Attaches the Clerk JWT so RLS knows who the user is.
//  INSTALL: npm install @supabase/ssr @supabase/supabase-js
// ============================================================
 
import { createServerClient } from '@supabase/ssr'
import { auth } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
 
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  const { getToken } = await auth()
 
  // Get the Clerk JWT formatted for Supabase
  const clerkToken = await getToken({ template: 'supabase' })
 
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch { /* Server Component — ignore */ }
        },
      },
      global: {
        headers: {
          // Pass Clerk JWT as Bearer token so Supabase RLS
          // can identify the user via auth.clerk_user_id()
          Authorization: clerkToken ? `Bearer ${clerkToken}` : '',
        },
      },
    }
  )
}