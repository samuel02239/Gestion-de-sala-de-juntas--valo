/* =========================================================
   AVISOS.JS — Notificaciones al navegador
   - Cada navegador que acepta queda guardado en Firebase (avisos/subs).
   - Administradores: reciben aviso de cada solicitud nueva.
   - Solicitantes: reciben aviso cuando su solicitud se aprueba,
     se rechaza o se cancela, y un recordatorio antes de la reunión.
   Entrega:
   - Con la página abierta (aunque esté minimizada): al instante.
   - Con el navegador cerrado: push enviado por GitHub Actions
     cada ~5 min (ver scripts/enviar_avisos.py).
   La clave avisos/enviados/<reserva>/<tipo>/<navegador> evita avisos repetidos.
   ========================================================= */
const Avisos = (() => {
  const K_SUB = "salaJuntas.aviso";      // { id, admin, creado, sync }
  const K_MIAS = "salaJuntas.mias";      // códigos de solicitudes hechas o seguidas desde este navegador
  const K_VISTOS = "salaJuntas.vistos";  // avisos ya mostrados en este navegador
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const MAX_EDAD = 2 * 864e5; // no se avisan eventos de hace más de 2 días

  const fbUrl = () => (CONFIG.FIREBASE_URL || "").trim().replace(/\/+$/, "");
  const ls = {
    get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  const ahora = () => new Date().toISOString();
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalada = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  let swReg = null, corriendo = false, otraVez = false, ultimaLista = [];

  async function fb(path, method = "GET", body) {
    const res = await fetch(`${fbUrl()}/${path}.json`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (res.status === 401 || res.status === 403)
      throw new Error("La base de datos aún no permite guardar avisos. Falta habilitar el nodo «avisos» en las reglas de Firebase.");
    if (!res.ok) throw new Error(`Error de la base de datos (${res.status})`);
    return res.json();
  }

  /* ---------- Estado ---------- */
  // off | no | ios | bloqueado | inactivo | activo
  function soporte() {
    if (!fbUrl() || !CONFIG.VAPID_PUBLIC_KEY) return "off";
    if (!window.isSecureContext) return "no";
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
      return esIOS && !instalada() ? "ios" : "no";
    return "ok";
  }
  function estado() {
    const s = soporte();
    if (s !== "ok") return s;
    if (Notification.permission === "denied") return "bloqueado";
    return Notification.permission === "granted" && ls.get(K_SUB, null) ? "activo" : "inactivo";
  }
  const info = () => ls.get(K_SUB, null);
  const miId = () => (estado() === "activo" ? info().id : null);
  const esAdminAvisos = () => estado() === "activo" && Boolean(info().admin);

  /* ---------- Solicitudes de este navegador ---------- */
  const misIds = () => ls.get(K_MIAS, []);
  function agregarMias(ids) {
    const set = new Set(misIds());
    ids.forEach(id => set.add(id));
    ls.set(K_MIAS, [...set].slice(-100));
  }

  /* ---------- Suscripción ---------- */
  const b64ToBytes = s => {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    s += "=".repeat((4 - s.length % 4) % 4);
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
  };
  async function hashId(txt) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
    return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function equipo() {
    const ua = navigator.userAgent;
    const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
      : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
    const so = /Android/.test(ua) ? "Android" : esIOS ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows"
      : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
    return `${nav}${so ? " · " + so : ""}`;
  }

  async function registrarSW() {
    if (soporte() !== "ok") return null;
    if (!swReg) {
      try { swReg = await navigator.serviceWorker.register("sw.js"); }
      catch (e) { console.warn("No se pudo registrar el service worker", e); return null; }
    }
    return swReg;
  }

  async function suscripcionPush() {
    const reg = await registrarSW();
    if (!reg) throw new Error("Este navegador no permite avisos.");
    await navigator.serviceWorker.ready;
    const llave = b64ToBytes(CONFIG.VAPID_PUBLIC_KEY);
    let sub = await reg.pushManager.getSubscription();
    const actual = sub?.options?.applicationServerKey;
    if (sub && actual && new Uint8Array(actual).join() !== llave.join()) { await sub.unsubscribe(); sub = null; }
    return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llave });
  }

  // Pide permiso y guarda este navegador. { admin: true } para recibir las solicitudes nuevas.
  async function activar({ admin } = {}) {
    const s = soporte();
    if (s === "ios") throw new Error("En iPhone/iPad primero agregue esta página a la pantalla de inicio (botón Compartir → «Agregar a inicio») y ábrala desde ese ícono.");
    if (s === "off") throw new Error("Los avisos no están configurados en este sitio.");
    if (s !== "ok") throw new Error("Este navegador no permite avisos. Pruebe con Chrome, Edge o Firefox.");

    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      throw new Error(perm === "denied"
        ? "Los avisos están bloqueados. Toque el candado junto a la dirección de la página y permita las notificaciones."
        : "No se concedió el permiso para mostrar avisos.");
    }

    let json;
    try { json = (await suscripcionPush()).toJSON(); }
    catch (e) {
      console.warn("Avisos:", e);
      throw new Error("No se pudo registrar este navegador para avisos. Si está en una ventana privada o de incógnito, abra la página en una ventana normal e intente de nuevo.");
    }
    const id = await hashId(json.endpoint);
    const prev = info();
    const yo = {
      id,
      admin: admin ?? Boolean(prev?.admin),
      creado: prev?.id === id ? prev.creado : ahora(),
      sync: Date.now()
    };
    await fb(`avisos/subs/${id}`, "PUT", {
      endpoint: json.endpoint, keys: json.keys,
      admin: yo.admin, creado: yo.creado, visto: ahora(), equipo: equipo()
    });
    if (prev?.id && prev.id !== id) fb(`avisos/subs/${prev.id}`, "DELETE").catch(() => {});
    ls.set(K_SUB, yo);
    await vincular(misIds());
    return yo;
  }

  // Une este navegador a solicitudes (para recibir su aprobación o rechazo)
  async function vincular(ids) {
    const yo = info();
    if (!yo || !ids.length) return;
    const existentes = (ultimaLista.length ? ultimaLista : Data.list()).filter(r => ids.includes(r.id));
    await Promise.all(existentes
      .filter(r => !(r.subs && r.subs[yo.id]))
      .map(r => fb(`reservas/${r.id}`, "PATCH", { [`subs/${yo.id}`]: ahora() }).catch(() => {})));
  }

  async function seguir(ids) {
    agregarMias(ids);
    if (estado() !== "activo") await activar();
    else await vincular(ids);
  }

  async function quitarAdmin() {
    const yo = info();
    if (!yo) return;
    await fb(`avisos/subs/${yo.id}`, "PATCH", { admin: false });
    ls.set(K_SUB, { ...yo, admin: false });
  }

  async function desactivar() {
    const yo = info();
    try { (await swReg?.pushManager.getSubscription())?.unsubscribe(); } catch {}
    if (yo) await fb(`avisos/subs/${yo.id}`, "DELETE").catch(() => {});
    try { localStorage.removeItem(K_SUB); } catch {}
  }

  // Al abrir la página: confirma que la suscripción sigue viva (el navegador puede renovarla)
  async function sincronizar() {
    const yo = info();
    if (!yo || estado() !== "activo") return;
    try {
      const sub = await suscripcionPush();
      if ((await hashId(sub.endpoint)) !== yo.id) return void (await activar({ admin: yo.admin }));
      if (yo.sync && Date.now() - yo.sync < 864e5) return; // una vez al día basta
      const remoto = await fb(`avisos/subs/${yo.id}`);
      if (!remoto) return void (await activar({ admin: yo.admin }));
      await fb(`avisos/subs/${yo.id}`, "PATCH", { visto: ahora(), admin: yo.admin });
      ls.set(K_SUB, { ...yo, sync: Date.now() });
    } catch (e) { console.warn("Avisos:", e.message); }
  }

  async function contarAdmins() {
    try {
      const subs = await fb("avisos/subs");
      return Object.values(subs || {}).filter(s => s && s.admin).length;
    } catch { return null; }
  }

  /* ---------- Mensajes ---------- */
  const pad = n => String(n).padStart(2, "0");
  function hora12(hhmm) {
    let [h, m] = String(hhmm || "0:0").split(":").map(Number);
    const suf = h >= 12 ? "p. m." : "a. m.";
    return `${h % 12 || 12}:${pad(m)} ${suf}`;
  }
  function fechaCorta(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    const f = new Date(y, m - 1, d);
    return `${DIAS[f.getDay()]} ${d} ${MESES[m - 1]}`;
  }
  const cuando = r => `${fechaCorta(r.fecha)} · ${hora12(r.horaInicio)} – ${hora12(r.horaFin)}`;

  function mensaje(tipo, r) {
    const motivo = r.motivo ? `\nMotivo: ${r.motivo}` : "";
    return {
      nueva: { title: "📩 Nueva solicitud de sala", body: `«${r.tema}»\n${cuando(r)}\nSolicita: ${r.nombre}`, url: "#admin", tag: `nueva-${r.id}` },
      aprobada: { title: "✅ Reunión aprobada", body: `«${r.tema}»\n${cuando(r)}\nYa está publicada en el cronograma.`, url: "#consultar", tag: `estado-${r.id}` },
      rechazada: { title: "❌ Solicitud no aprobada", body: `«${r.tema}»\n${cuando(r)}${motivo}`, url: "#consultar", tag: `estado-${r.id}` },
      cancelada: { title: "⚠️ Reunión cancelada", body: `«${r.tema}»\n${cuando(r)}${motivo}`, url: "#consultar", tag: `estado-${r.id}` }
    }[tipo];
  }

  // Eventos que le corresponden a este navegador según una solicitud
  function eventosPara(r, yo) {
    const evs = [];
    const mia = r.subs && r.subs[yo.id];
    if (yo.admin && !mia && r.estado === "pendiente" && r.creada >= yo.creado)
      evs.push({ tipo: "nueva", fecha: r.creada });
    if (mia && r.revisada && (r.estado === "aprobada" || r.estado === "rechazada")) {
      const tipo = r.estado === "aprobada" ? "aprobada" : r.cancelada ? "cancelada" : "rechazada";
      if (typeof mia !== "string" || r.revisada >= mia) evs.push({ tipo, fecha: r.revisada });
    }
    return evs;
  }

  async function mostrar(a) {
    const reg = swReg || (await navigator.serviceWorker.ready);
    await reg.showNotification(a.title, {
      body: a.body, tag: a.tag, renotify: true, lang: "es",
      icon: "icon-192.png", badge: "icon-badge.png", data: { url: a.url }
    });
  }

  // Revisa los datos en vivo y muestra al instante los avisos que este navegador no ha recibido
  async function revisar(lista) {
    ultimaLista = lista || [];
    const yo = info();
    if (!yo || estado() !== "activo") return;
    if (corriendo) { otraVez = true; return; }
    corriendo = true;
    try {
      const vistos = new Set(ls.get(K_VISTOS, []));
      const limite = new Date(Date.now() - MAX_EDAD).toISOString();
      for (const r of ultimaLista) {
        for (const ev of eventosPara(r, yo)) {
          const clave = `${r.id}/${ev.tipo}`;
          if (vistos.has(clave) || ev.fecha < limite) continue;
          vistos.add(clave);
          ls.set(K_VISTOS, [...vistos].slice(-300));
          // ¿Ya lo entregó el envío automático (push)?
          const ya = await fb(`avisos/enviados/${r.id}/${ev.tipo}/${yo.id}`).catch(() => null);
          if (ya) continue;
          await mostrar(mensaje(ev.tipo, r));
          fb(`avisos/enviados/${r.id}/${ev.tipo}`, "PATCH", { [yo.id]: true }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Avisos:", e.message);
    } finally {
      corriendo = false;
      if (otraVez) { otraVez = false; revisar(ultimaLista); }
    }
  }

  const probar = () => mostrar({
    title: "🔔 Avisos activos",
    body: `Así le llegarán los avisos de la sala ${CONFIG.NOMBRE_SALA} en este navegador.`,
    tag: "prueba", url: "./"
  });

  function init() {
    if (soporte() !== "ok") return;
    navigator.serviceWorker.addEventListener("message", e => {
      if (e.data?.ir) location.href = e.data.ir;
      if (e.data?.renovar) sincronizar();
    });
    registrarSW().then(() => sincronizar());
  }

  return {
    init, estado, soporte, miId, esAdminAvisos, info,
    activar, desactivar, quitarAdmin, seguir, vincular, revisar, probar, contarAdmins,
    misIds, agregarMias
  };
})();
