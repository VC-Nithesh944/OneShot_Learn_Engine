/* Service Worker for push notifications */
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
