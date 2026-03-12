self.addEventListener("install", event => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || "OpenTime";
  const options = {
    body: data.body || "Новое уведомление",
    icon: "data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><text y=\".9em\" font-size=\"90\">📅</text></svg>",
    badge: "data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><text y=\".9em\" font-size=\"90\">📅</text></svg>",
    data: { url: data.url || "/" },
    tag: data.tag || "opentime",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).toString();
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if ("focus" in client) {
        client.postMessage({ type: "opentime-push-open", url });
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(url);
  })());
});
