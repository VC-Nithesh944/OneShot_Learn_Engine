import webpush from "web-push";

let configured = false;

export function ensureWebPushConfigured() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    return null;
  }

  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@example.com",
      publicKey,
      privateKey,
    );
    configured = true;
  }

  return webpush;
}

export function toWebPushSubscription(row) {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth_key,
    },
  };
}

export async function sendPushToUserSubscriptions({ admin, userId, payload }) {
  const push = ensureWebPushConfigured();
  if (!push) {
    return {
      total: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      reason: "VAPID keys not configured",
    };
  }

  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .eq("clerk_user_id", userId);

  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const subscription of subscriptions ?? []) {
    try {
      await push.sendNotification(
        toWebPushSubscription(subscription),
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (err) {
      const statusCode = Number(err?.statusCode ?? err?.status ?? 0);
      if (statusCode === 404 || statusCode === 410) {
        await admin
          .from("push_subscriptions")
          .delete()
          .eq("clerk_user_id", userId)
          .eq("endpoint", subscription.endpoint);
        skipped += 1;
      } else {
        console.error(
          `[push] failed for ${userId} / ${subscription.endpoint}:`,
          err?.message ?? err,
        );
        failed += 1;
      }
    }
  }

  return {
    total: subscriptions?.length ?? 0,
    sent,
    skipped,
    failed,
  };
}
