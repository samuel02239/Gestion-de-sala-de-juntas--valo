/* =========================================================
   DATA.JS — Sincronización en tiempo real
   Envuelve a Store (storage.js) y avisa a la app cada vez que
   los datos cambian, en este equipo o en cualquier otro:
   - Con FIREBASE_URL: conexión en vivo (EventSource) + respaldo cada 30 s
   - Sin FIREBASE_URL: sincroniza las pestañas de este navegador
   ========================================================= */
const Data = (() => {
  let cache = [], firmado = null, started = false, pend, statusFn = () => {};
  const listeners = new Set();
  const url = () => (CONFIG.FIREBASE_URL || "").trim().replace(/\/+$/, "");
  const status = s => statusFn(s);
  const firma = l => JSON.stringify([...l].sort((a, b) => (a.id < b.id ? -1 : 1)));

  async function load() {
    const lista = await Store.all();
    const f = firma(lista);
    cache = lista;
    if (f !== firmado) {
      firmado = f;
      listeners.forEach(fn => { try { fn(cache); } catch (e) { console.error(e); } });
    }
    return cache;
  }

  const refrescar = () => {
    clearTimeout(pend);
    pend = setTimeout(() => load().catch(() => status("error")), 150);
  };

  function escucharRemoto() {
    if (window.EventSource) {
      const es = new EventSource(`${url()}/reservas.json`);
      es.onopen = () => status("live");
      es.onerror = () => status("retry"); // el navegador reintenta solo
      ["put", "patch"].forEach(t => es.addEventListener(t, refrescar));
      ["cancel", "auth_revoked"].forEach(t => es.addEventListener(t, () => status("error")));
    } else status("live");
    setInterval(refrescar, 30000);
    window.addEventListener("online", refrescar);
  }

  function escucharLocal() {
    window.addEventListener("storage", e => { if (e.key === "salaJuntas.reservas") refrescar(); });
    status("local");
  }

  const mutar = fn => async (...args) => { const r = await fn(...args); await load(); return r; };

  return {
    init() {
      if (started) return;
      started = true;
      Store.isShared() ? escucharRemoto() : escucharLocal();
      document.addEventListener("visibilitychange", () => { if (!document.hidden) refrescar(); });
      return load().catch(() => status("error"));
    },
    load,
    list: () => cache,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onStatus(fn) { statusFn = fn; },
    save: mutar(r => Store.save(r)),
    update: mutar((id, patch) => Store.update(id, patch)),
    remove: mutar(id => Store.remove(id))
  };
})();
