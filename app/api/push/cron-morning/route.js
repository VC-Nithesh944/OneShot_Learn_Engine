import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUserSubscriptions } from "@/lib/pushNotifications";

function isAuthorized(request) {
  return (
    request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
  );
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("clerk_user_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = [...new Set((rows ?? []).map((row) => row.clerk_user_id))];

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const [dueRes, conceptsRes] = await Promise.all([
        admin.rpc("get_due_concepts_for_user", { p_user_id: userId }),
        admin
          .from("concepts")
          .select("id, title, user_id")
          .eq("user_id", userId)
          .limit(3),
      ]);

      const { data: attempts } = await admin
        .from("quiz_attempts")
        .select("concept_id, estimated_retention_pct, attempted_at")
        .eq("user_id", userId)
        .order("attempted_at", { ascending: false });

      const latestRetentionByConcept = new Map();
      for (const attempt of attempts ?? []) {
        if (!latestRetentionByConcept.has(attempt.concept_id)) {
          const value = Number(attempt.estimated_retention_pct);
          if (Number.isFinite(value)) {
            latestRetentionByConcept.set(attempt.concept_id, value);
          }
        }
      }

      const fadingConcepts = (conceptsRes.data ?? [])
        .map((concept) => ({
          ...concept,
          retention_pct: latestRetentionByConcept.get(concept.id),
        }))
        .filter(
          (concept) =>
            Number.isFinite(Number(concept.retention_pct)) &&
            Number(concept.retention_pct) < 40,
        )
        .sort(
          (left, right) =>
            Number(left.retention_pct) - Number(right.retention_pct),
        )
        .slice(0, 3);

      const dueConcepts = dueRes.data ?? [];

      if (dueConcepts.length === 0 && fadingConcepts.length === 0) {
        skipped += 1;
        continue;
      }

      let title;
      let body;

      if (fadingConcepts.length > 0 && dueConcepts.length > 0) {
        title = `⚠️ ${fadingConcepts.length} concept${
          fadingConcepts.length > 1 ? "s" : ""
        } fading fast`;
        body = `Plus ${dueConcepts.length} due for review today. Your best recall window is the next 3 hours.`;
      } else if (fadingConcepts.length > 0) {
        title = `⚠️ ${fadingConcepts.length} concept${
          fadingConcepts.length > 1 ? "s" : ""
        } fading fast`;
        body = `Retention dropping below 40%. Quiz now before it disappears.`;
      } else {
        title = `📚 ${dueConcepts.length} concept${
          dueConcepts.length > 1 ? "s" : ""
        } ready for review`;
        body = `Good morning! ${dueConcepts.length} concept${
          dueConcepts.length > 1 ? "s are" : " is"
        } ready for review today.`;
      }

      const result = await sendPushToUserSubscriptions({
        admin,
        userId,
        payload: {
          title,
          body,
          icon: "/globe.svg",
          badge: "/window.svg",
          tag: "morning-digest",
          data: { url: "/dashboard" },
        },
      });

      sent += result.sent;
      skipped += result.skipped;
      failed += result.failed;
    } catch (err) {
      console.error(
        `[cron-morning] failed for ${userId}:`,
        err?.message ?? err,
      );
      failed += 1;
    }
  }

  return NextResponse.json({ sent, skipped, failed, users: userIds.length });
}
