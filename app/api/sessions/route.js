// ============================================================
//  FILE: app/api/sessions/route.js
//  GET → all sessions for the user
// ============================================================
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("study_sessions")
    .select(
      `
      id, filename, topic, subject, subject_code, reading_level,
      cognitive_load, concept_count, exam_summary, is_processed, created_at,
      cognitive_load_reports ( level, load_score, recommendation )
    `,
    )
    .eq("user_id", userId)
    .eq("is_processed", true)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data });
}
