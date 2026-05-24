import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function buildProfileResponse(profile, concepts, attempts, sessions) {
  const latestByConceptId = new Map();
  const attemptCountByConceptId = new Map();
  for (const attempt of attempts) {
    if (!latestByConceptId.has(attempt.concept_id)) {
      latestByConceptId.set(attempt.concept_id, attempt);
    }
    attemptCountByConceptId.set(
      attempt.concept_id,
      (attemptCountByConceptId.get(attempt.concept_id) ?? 0) + 1,
    );
  }

  let mastered = 0;
  let learning = 0;
  let atRisk = 0;
  let notAttempted = 0;

  for (const concept of concepts) {
    const attempt = latestByConceptId.get(concept.id);
    const attemptCount = attemptCountByConceptId.get(concept.id) ?? 0;
    if (!attempt) {
      notAttempted += 1;
      continue;
    }

    const pct = attempt.score ?? 0;
    if (attemptCount >= 4) mastered += 1;
    else if (pct >= 45) learning += 1;
    else atRisk += 1;
  }

  const totalAttempts = attempts.length;
  const correctCount = attempts.filter((attempt) => attempt.was_correct).length;
  const avgAccuracy =
    totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : null;

  const today = new Date();
  const heatmap = {};
  for (let dayOffset = 0; dayOffset < 30; dayOffset += 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    heatmap[date.toISOString().slice(0, 10)] = 0;
  }

  for (const attempt of attempts) {
    const day = attempt.attempted_at?.slice(0, 10);
    if (day && day in heatmap) heatmap[day] += 1;
  }

  const activityData = Object.entries(heatmap)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => ({ date, count }));

  const subjectMap = new Map();
  for (const session of sessions) {
    const key = session.subject ?? "General";
    if (!subjectMap.has(key)) {
      subjectMap.set(key, {
        subject: key,
        total: 0,
        attempted: 0,
        scores: [],
      });
    }

    const entry = subjectMap.get(key);
    entry.total += Number(session.concept_count ?? 0);
  }

  for (const concept of concepts) {
    const session = sessions.find((item) => item.id === concept.session_id);
    if (!session) continue;

    const entry = subjectMap.get(session.subject ?? "General");
    if (!entry) continue;

    const attempt = latestByConceptId.get(concept.id);
    if (attempt) {
      entry.attempted += 1;
      entry.scores.push(attempt.score ?? 0);
    }
  }

  const subjectBreakdown = Array.from(subjectMap.values())
    .map((entry) => ({
      subject: entry.subject,
      total: entry.total,
      attempted: entry.attempted,
      avgScore:
        entry.scores.length > 0
          ? Math.round(
              entry.scores.reduce((sum, value) => sum + value, 0) /
                entry.scores.length,
            )
          : null,
    }))
    .sort((left, right) => right.attempted - left.attempted);

  const learningStyle = profile?.learning_style ?? "balanced";

  const achievements = [];
  if (totalAttempts >= 1) {
    achievements.push({
      id: "first_quiz",
      icon: "✦",
      label: "First Recall",
      desc: "Completed your first quiz",
    });
  }
  if ((profile?.current_streak ?? 0) >= 3) {
    achievements.push({
      id: "streak_3",
      icon: "🔥",
      label: "On a Roll",
      desc: "3-day study streak",
    });
  }
  if ((profile?.current_streak ?? 0) >= 7) {
    achievements.push({
      id: "streak_7",
      icon: "⚡",
      label: "Week Warrior",
      desc: "7-day study streak",
    });
  }
  if (mastered >= 5) {
    achievements.push({
      id: "mastered_5",
      icon: "◎",
      label: "Quick Learner",
      desc: "5 concepts mastered",
    });
  }
  if (mastered >= 20) {
    achievements.push({
      id: "mastered_20",
      icon: "🧠",
      label: "Sharp Mind",
      desc: "20 concepts mastered",
    });
  }
  if (sessions.length >= 3) {
    achievements.push({
      id: "sessions_3",
      icon: "≡",
      label: "Dedicated",
      desc: "Uploaded 3 study sessions",
    });
  }
  if (avgAccuracy !== null && avgAccuracy >= 80) {
    achievements.push({
      id: "accuracy_80",
      icon: "◉",
      label: "High Precision",
      desc: "80%+ average quiz accuracy",
    });
  }
  if (concepts.length >= 50) {
    achievements.push({
      id: "concepts_50",
      icon: "⬡",
      label: "Knowledge Base",
      desc: "50+ concepts in your library",
    });
  }

  const allBadges = [
    {
      id: "first_quiz",
      icon: "✦",
      label: "First Recall",
      desc: "Complete your first quiz",
    },
    {
      id: "streak_3",
      icon: "🔥",
      label: "On a Roll",
      desc: "3-day study streak",
    },
    {
      id: "streak_7",
      icon: "⚡",
      label: "Week Warrior",
      desc: "7-day study streak",
    },
    {
      id: "mastered_5",
      icon: "◎",
      label: "Quick Learner",
      desc: "Master 5 concepts",
    },
    {
      id: "mastered_20",
      icon: "🧠",
      label: "Sharp Mind",
      desc: "Master 20 concepts",
    },
    {
      id: "sessions_3",
      icon: "≡",
      label: "Dedicated",
      desc: "Upload 3 sessions",
    },
    {
      id: "accuracy_80",
      icon: "◉",
      label: "High Precision",
      desc: "80%+ quiz accuracy",
    },
    {
      id: "concepts_50",
      icon: "⬡",
      label: "Knowledge Base",
      desc: "50+ concepts saved",
    },
  ];
  const earnedIds = new Set(achievements.map((achievement) => achievement.id));
  const badgesWithStatus = allBadges.map((badge) => ({
    ...badge,
    earned: earnedIds.has(badge.id),
  }));

  return {
    profile: {
      display_name: profile?.display_name ?? "Student",
      learning_style: learningStyle,
      current_streak: profile?.current_streak ?? 0,
      longest_streak: profile?.longest_streak ?? 0,
      member_since: profile?.created_at ?? null,
    },
    memory: {
      mastered,
      learning,
      atRisk,
      notAttempted,
      total: concepts.length,
    },
    stats: { totalAttempts, avgAccuracy, totalSessions: sessions.length },
    activityData,
    subjectBreakdown,
    badges: badgesWithStatus,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createServerSupabaseClient();

  const [profileRes, conceptsRes, attemptsRes, sessionsRes] = await Promise.all(
    [
      supabase
        .from("user_profiles")
        .select("*")
        .eq("clerk_user_id", userId)
        .single(),

      supabase
        .from("concepts")
        .select(
          "id, title, session_id, complexity, category, retention_pct, exam_probability",
        )
        .eq("user_id", userId),

      supabase
        .from("quiz_attempts")
        .select("concept_id, score, quality_rating, was_correct, attempted_at")
        .eq("user_id", userId)
        .order("attempted_at", { ascending: false }),

      supabase
        .from("study_sessions")
        .select("id, topic, subject, subject_code, concept_count, created_at")
        .eq("user_id", userId)
        .eq("is_processed", true)
        .order("created_at", { ascending: false }),
    ],
  );

  let profile = profileRes.data;
  if (!profile) {
    const admin = createAdminClient();
    const { data: createdProfile, error } = await admin
      .from("user_profiles")
      .insert({
        clerk_user_id: userId,
        display_name: "Student",
        learning_style: "balanced",
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    profile = createdProfile;
  }

  const concepts = conceptsRes.data ?? [];
  const attempts = attemptsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  return NextResponse.json({
    ...buildProfileResponse(profile, concepts, attempts, sessions),
  });
}

export async function PATCH(request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const allowed = ["display_name", "learning_style"];
  const updates = {};

  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (updates.display_name !== undefined) {
    const trimmed = String(updates.display_name).trim();
    if (trimmed.length < 1 || trimmed.length > 50) {
      return NextResponse.json(
        { error: "Name must be 1–50 characters." },
        { status: 400 },
      );
    }
    updates.display_name = trimmed;
  }

  const validStyles = ["visual", "story", "analogy", "simplified", "balanced"];
  if (updates.learning_style && !validStyles.includes(updates.learning_style)) {
    return NextResponse.json(
      { error: "Invalid learning style." },
      { status: 400 },
    );
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_profiles")
    .update(updates)
    .eq("clerk_user_id", userId)
    .select("display_name, learning_style")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: data });
}
