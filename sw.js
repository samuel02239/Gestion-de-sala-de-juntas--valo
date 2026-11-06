/* =========================================================
   SERVICE WORKER — Avisos al navegador
   Recibe las notificaciones push (aunque la página esté cerrada)
   y abre la sección correcta al tocarlas.
   No guarda la página en caché: siempre se carga la versión publicada.
   ========================================================= */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Sala de Juntas", {
    body: d.body || "",
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    icon: "icon-192.png",
    badge: "icon-badge.png",
    lang: "es",
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const propia = abiertas.find(c => c.url.startsWith(self.registration.scope));
    if (propia) {
      propia.postMessage({ ir: destino }); // la página cambia de sección sin recargar
      return propia.focus();
    }
    return self.clients.openWindow(destino);
  })());
});

// Si el navegador renueva la suscripción, se avisa a la página la próxima vez que abra
self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil(self.clients.matchAll({ type: "window" }).then(cs => cs.forEach(c => c.postMessage({ renovar: true }))));
});
