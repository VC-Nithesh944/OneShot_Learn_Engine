const CACHE_VERSION = "v1";
const STATIC_CACHE = `oneshot-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `oneshot-dynamic-${CACHE_VERSION}`;
const API_CACHE = `oneshot-api-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/dashboard",
  "/offline.html",
  "/Icon.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/apple-touch-icon.png",
];

const CACHEABLE_API_PATTERNS = [
  /\/api\/dashboard/,
  /\/api\/sessions/,
  /\/api\/user\/profile/,
];

const NEVER_CACHE_PATTERNS = [
  /\/api\/extract/,
  /\/api\/quiz\/submit/,
  /\/api\/stripe/,
  /\/api\/pyq\/analyze/,
  /clerk\.com/,
  /supabase\.co/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})),
        ),
      ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (name) =>
                name.startsWith("oneshot-") &&
                ![STATIC_CACHE, DYNAMIC_CACHE, API_CACHE].includes(name),
            )
            .map((oldCache) => caches.delete(oldCache)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;
  if (NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url.href))) return;

  if (url.pathname.startsWith("/api/")) {
    const isCacheable = CACHEABLE_API_PATTERNS.some((pattern) =>
      pattern.test(url.pathname),
    );
    if (isCacheable) {
      event.respondWith(networkFirstWithCache(request, API_CACHE, 4000));
    }
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  if (
    request.destination === "image" ||
    request.destination === "font" ||
    url.pathname === "/Icon.png" ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
    return;
  }

  if (request.destination === "document") {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
    return;
  }

  event.respondWith(networkWithOfflineFallback(request));
});

async function cacheFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirstWithCache(request, cacheName, timeoutMs = 4000) {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs),
      ),
    ]);

    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: {
          ...Object.fromEntries(cached.headers.entries()),
          "X-SW-Cache": "stale",
        },
      });
    }
    return new Response(JSON.stringify({ error: "Offline", offline: true }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || networkFetch || offlineFallback();
}

async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    if (request.destination === "document") {
      return offlineFallback();
    }
    return new Response("Offline", { status: 503 });
  }
}

async function offlineFallback() {
  const cache = await caches.open(STATIC_CACHE);
  return (
    cache.match("/offline.html") ||
    new Response("<h1>Offline</h1>", {
      headers: { "Content-Type": "text/html" },
    })
  );
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "OneShot", body: event.data.text() };
  }

  const options = {
    body: payload.body ?? "Time to review!",
    icon: payload.icon ?? "/icons/icon-192x192.png",
    badge: payload.badge ?? "/icons/badge-72x72.png",
    tag: payload.tag ?? "oneshot-review",
    renotify: false,
    silent: false,
    data: payload.data ?? { url: "/dashboard" },
    actions: [
      { action: "review", title: "Review now" },
      { action: "dismiss", title: "Later" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "OneShot", options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url ?? "/dashboard";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      }),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-quiz-submissions") {
    event.waitUntil(syncPendingQuizSubmissions());
  }
});

async function syncPendingQuizSubmissions() {
  console.log("[SW] Background sync: quiz submissions");
} /* Service Worker for push notifications */
self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Notification", body: event.data?.text() ?? "" };
  }

  const title = data.title || "Oneshot Reminder";
  const options = {
    body: data.body || "Time to review a concept",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: data.data?.url || data.url || "/",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
