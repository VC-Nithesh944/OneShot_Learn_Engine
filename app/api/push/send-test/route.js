import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";

// Requires VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY env vars
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const subId = body?.id ?? null;
  const admin = createAdminClient();

  const { data: sub, error } = await admin
    .from("push_subscriptions")
    .select("*")
    .eq("clerk_user_id", userId)
    .limit(1)
    .single();
  if (error || !sub)
    return NextResponse.json(
      { error: "No subscription found" },
      { status: 404 },
    );

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "VAPID keys not configured" },
      { status: 500 },
    );
  }

  const subscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth_key },
  };

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: body?.title || "Test",
        body: body?.body || "This is a test notification.",
      }),
    );
    return NextResponse.json({ sent: true });
  } catch (err) {
    return NextResponse.json({ error: err?.toString() }, { status: 500 });
  }
}
