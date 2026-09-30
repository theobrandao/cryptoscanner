/* Service worker mínimo: torna o app instalável e oferece uma casca offline para navegação.
   Não intercepta chunks, RSC nem /api — esses vão direto à rede/CDN. */
const SHELL = "cs-shell-v4";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/icons/icon-192.png", "/icons/icon-512.png"]).catch(() => undefined)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
    return;
  }
  // apenas navegação de página; offline cai na casca em cache
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/").then((r) => r || Response.error())));
  }
});

/* Web Push: notificações de agentes, sentinelas, alertas e falhas operacionais. */
self.addEventListener("push", (e) => {
  let data = { title: "CryptoScanner", body: "", url: "/" };
  try {
    data = Object.assign(data, e.data ? e.data.json() : {});
  } catch {
    data.body = e.data ? e.data.text() : "";
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          c.navigate(target);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
