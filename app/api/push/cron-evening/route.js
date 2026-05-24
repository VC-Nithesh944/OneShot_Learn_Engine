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

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  for (const userId of userIds) {
    try {
      const [attemptRes, profileRes] = await Promise.all([
        admin
          .from("quiz_attempts")
          .select("id")
          .eq("user_id", userId)
          .gte("attempted_at", todayIso)
          .limit(1),
        admin
          .from("user_profiles")
          .select("current_streak, display_name")
          .eq("clerk_user_id", userId)
          .maybeSingle(),
      ]);

      if ((attemptRes.data ?? []).length > 0) {
        skipped += 1;
        continue;
      }

      const streak = profileRes.data?.current_streak ?? 0;
      if (streak < 1) {
        skipped += 1;
        continue;
      }

      const name = profileRes.data?.display_name ?? "there";

      const result = await sendPushToUserSubscriptions({
        admin,
        userId,
        payload: {
          title: `🔥 Streak at risk, ${name}`,
          body: `Your ${streak}-day streak ends in a few hours. Even one quick concept keeps it alive.`,
          icon: "/globe.svg",
          badge: "/window.svg",
          tag: "streak-reminder",
          data: { url: "/dashboard" },
        },
      });

      sent += result.sent;
      skipped += result.skipped;
      failed += result.failed;
    } catch (err) {
      console.error(
        `[cron-evening] failed for ${userId}:`,
        err?.message ?? err,
      );
      failed += 1;
    }
  }

  return NextResponse.json({ sent, skipped, failed, users: userIds.length });
}
