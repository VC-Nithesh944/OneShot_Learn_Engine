// ============================================================
//  FILE: app/api/user/profile/route.js
//  GET  → fetch or auto-create user profile on first login
//  PATCH → update learning style
// ============================================================
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
 
export async function GET() {
  const { userId, user } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 
  const supabase = await createServerSupabaseClient()
 
  // Try to fetch existing profile
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('clerk_user_id', userId)
    .single()
 
  if (existing) return NextResponse.json({ profile: existing, isNew: false })
 
  // First login — auto-create profile (upsert is safe)
  const { data: created, error } = await supabase
    .from('user_profiles')
    .insert({
      clerk_user_id:   userId,
      display_name:    user?.firstName ?? 'Student',
      email:           user?.primaryEmailAddress?.emailAddress ?? null,
      onboarding_done: false,
    })
    .select()
    .single()
 
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
 
  return NextResponse.json({ profile: created, isNew: true })
}
 
export async function PATCH(request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 
  const body = await request.json()
  const allowed = ['learning_style', 'display_name', 'onboarding_done']
  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  )
 
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('clerk_user_id', userId)
    .select()
    .single()
 
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}