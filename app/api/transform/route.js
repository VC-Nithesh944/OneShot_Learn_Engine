// ============================================================
//  FILE: app/api/transform/route.js
//  POST → get (or generate + cache) a concept transform
//
//  Body: { conceptId, style: 'analogy'|'visual'|'story'|'simplified' }
// ============================================================
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { transformConcept } from '@/lib/transformConcept'
import { NextResponse } from 'next/server'
 
export async function POST(request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 
  const { conceptId, style } = await request.json()
  if (!conceptId || !style) {
    return NextResponse.json({ error: 'conceptId and style required' }, { status: 400 })
  }
 
  const supabase = await createServerSupabaseClient()
 
  // ── Check cache first (saves Gemini quota)
  const { data: cached } = await supabase
    .from('concept_transforms')
    .select('*')
    .eq('concept_id', conceptId)
    .eq('transform_type', style)
    .single()
 
  if (cached) return NextResponse.json({ transform: cached, cached: true })
 
  // ── Cache miss — fetch concept and generate
  const { data: concept, error: conceptErr } = await supabase
    .from('concepts')
    .select('*')
    .eq('id', conceptId)
    .eq('user_id', userId) // RLS double-check
    .single()
 
  if (conceptErr || !concept) {
    return NextResponse.json({ error: 'Concept not found' }, { status: 404 })
  }
 
  const result = await transformConcept(concept, style)
 
  // ── Save to cache
  const { data: saved } = await supabase
    .from('concept_transforms')
    .insert({
      concept_id:             conceptId,
      transform_type:         style,
      transformed_explanation: result.transformed_explanation,
      analogy_or_visual:      result.analogy_or_visual,
      memory_hook:            result.memory_hook,
      example:                result.example,
    })
    .select()
    .single()
 
  return NextResponse.json({ transform: saved, cached: false })
}