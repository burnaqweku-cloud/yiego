/* DataYego notifications helper. It does one job: show a notification when one arrives and open
   the right page when it is tapped. It never caches or answers page requests, so it cannot serve
   an old copy of the site. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  const title = typeof data.title === "string" && data.title ? data.title : "DataYego";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/yiego-icon-192.png",
    badge: "/yiego-icon-192.png",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of open) {
      if ("focus" in client) { await client.focus(); if ("navigate" in client) { try { await client.navigate(path); } catch (_) { /* stays where it is */ } } return; }
    }
    await self.clients.openWindow(path);
  })());
});
