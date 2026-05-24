import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const subscription = body?.subscription;
  if (!subscription || !subscription.endpoint) {
    return NextResponse.json(
      { error: "subscription required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // normalize keys
  const p256dh = subscription.keys?.p256dh ?? null;
  const authKey = subscription.keys?.auth ?? null;

  const payload = {
    clerk_user_id: userId,
    endpoint: subscription.endpoint,
    p256dh,
    auth_key: authKey,
  };

  const { data, error } = await admin
    .from("push_subscriptions")
    .upsert(payload, { onConflict: "clerk_user_id,endpoint" })
    .select("id, endpoint, created_at")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: data });
}

export async function DELETE(request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const endpoint = body?.endpoint;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("clerk_user_id", userId)
    .eq("endpoint", endpoint);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
