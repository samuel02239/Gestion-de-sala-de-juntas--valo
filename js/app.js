/* =========================================================
   SALA DE JUNTAS — Lógica de la aplicación
   ========================================================= */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const HOUR_H = 64; // debe coincidir con --hour-h en styles.css
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const COLORES = ["#0b3d6e", "#0f8b8d", "#7c3aed", "#c2410c", "#be185d", "#15803d", "#1d4ed8", "#a16207", "#4338ca", "#0e7490"];

/* ---------------- Utilidades ---------------- */
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const pad = n => String(n).padStart(2, "0");
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const toMin = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function inicioSemana(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay() || 7; // lunes = 1 ... domingo = 7
  return addDays(x, 1 - dow);
}

function fechaLarga(iso) {
  const d = parseISO(iso);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function hora12(hhmm) {
  let [h, m] = hhmm.split(":").map(Number);
  const suf = h >= 12 ? "p. m." : "a. m.";
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${suf}`;
}
const rango = r => `${hora12(r.horaInicio)} – ${hora12(r.horaFin)}`;

function colorDe(texto) {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}

const state = {
  semana: inicioSemana(new Date()),
  vista: window.innerWidth < 760 ? "lista" : "semana",
  adminTab: "pendiente",
  reservas: []
};

function seCruzan(a, b) {
  return a.fecha === b.fecha && a.horaInicio < b.horaFin && b.horaInicio < a.horaFin;
}

function toast(msg, tipo = "") {
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

async function cargar() {
  try {
    const todas = await Store.all();
    // Borra automáticamente las reuniones que ya pasaron hace más de DIAS_CONSERVAR días
    const limite = toISO(addDays(new Date(), -CONFIG.DIAS_CONSERVAR));
    const vencidas = todas.filter(r => r.fecha < limite);
    if (vencidas.length) await Promise.all(vencidas.map(r => Store.remove(r.id)));
    state.reservas = todas.filter(r => r.fecha >= limite);
  } catch (e) {
    toast(e.message, "err");
  }
  return state.reservas;
}

const aprobadas = () => state.reservas.filter(r => r.estado === "aprobada");

/* ---------------- Navegación ---------------- */
const VISTAS = ["inicio", "registrar", "cronograma", "consultar", "admin"];

function mostrar(vista) {
  if (!VISTAS.includes(vista)) vista = "inicio";
  VISTAS.forEach(v => { $(`#view-${v}`).hidden = v !== vista; });
  $$(".nav a").forEach(a => a.classList.toggle("active", a.dataset.go === vista));
  $("#nav").classList.remove("open");
  window.scrollTo({ top: 0 });

  if (vista === "inicio") renderHoy();
  if (vista === "cronograma") renderCalendario();
  if (vista === "registrar") actualizarDisponibilidad();
  if (vista === "admin") renderAdmin();
}

document.addEventListener("click", e => {
  const go = e.target.closest("[data-go]");
  if (go) {
    e.preventDefault();
    location.hash = go.dataset.go;
  }
});
window.addEventListener("hashchange", () => mostrar(location.hash.slice(1)));
$("#menuToggle").addEventListener("click", () => $("#nav").classList.toggle("open"));

/* ---------------- Modal ---------------- */
function abrirModal(html) {
  $("#modalBody").innerHTML = html;
  $("#modal").hidden = false;
}
function cerrarModal() { $("#modal").hidden = true; }
$("#modal").addEventListener("click", e => { if (e.target.closest("[data-close]")) cerrarModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") cerrarModal(); });

function verDetalle(id) {
  const r = state.reservas.find(x => x.id === id);
  if (!r) return;
  abrirModal(`
    <div class="modal-color" style="background:${colorDe(r.departamento)}"></div>
    <span class="status st-${r.estado}">${esc(r.estado)}</span>
    <h3>${esc(r.tema)}</h3>
    <div class="req-when">
      <span>📅 ${esc(fechaLarga(r.fecha))}</span>
      <span>🕒 ${esc(rango(r))}</span>
    </div>
    <div class="req-desc">${esc(r.descripcion)}</div>
    <div class="kv">
      <div><small>Departamento</small><span>${esc(r.departamento)}</span></div>
      <div><small>Persona a cargo</small><span>${esc(r.nombre)}</span></div>
      ${r.asistentes ? `<div><small>Asistentes</small><span>${esc(r.asistentes)}</span></div>` : ""}
      <div><small>Correo</small><span>${esc(r.correo)}</span></div>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" data-close>Cerrar</button></div>
  `);
}

/* ---------------- Inicio: reuniones de hoy ---------------- */
async function renderHoy() {
  const hoy = toISO(new Date());
  $("#hoyFecha").textContent = fechaLarga(hoy);
  await cargar();
  const lista = aprobadas().filter(r => r.fecha === hoy).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  $("#hoyLista").innerHTML = lista.length
    ? lista.map(r => `
        <li data-id="${esc(r.id)}">
          <span class="t-time">${esc(rango(r))}</span>
          <span><div class="t-title">${esc(r.tema)}</div><div class="t-dep">${esc(r.departamento)}</div></span>
        </li>`).join("")
    : `<li class="today-empty" style="cursor:default;background:none">✅ La sala está libre todo el día</li>`;
}
$("#hoyLista").addEventListener("click", e => {
  const li = e.target.closest("[data-id]");
  if (li) verDetalle(li.dataset.id);
});

/* ---------------- Formulario de registro ---------------- */
const form = $("#formReserva");

function initFormulario() {
  const hoy = toISO(new Date());
  $("#fecha").min = hoy;
  $("#horaInicio").min = $("#horaFin").min = CONFIG.HORA_APERTURA;
  $("#horaInicio").max = $("#horaFin").max = CONFIG.HORA_CIERRE;

  $("#descripcion").addEventListener("input", e => { $("#descCount").textContent = e.target.value.length; });
  $("#cc").addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, ""); });
  $("#telefono").addEventListener("input", e => { e.target.value = e.target.value.replace(/[^\d+\s]/g, ""); });

  ["fecha", "horaInicio", "horaFin"].forEach(id =>
    $("#" + id).addEventListener("change", actualizarDisponibilidad));

  form.addEventListener("reset", () => {
    setTimeout(() => {
      $$(".field.invalid", form).forEach(f => limpiarError(f));
      $("#descCount").textContent = "0";
      $("#alertaChoque").hidden = true;
      actualizarDisponibilidad();
    });
  });

  form.addEventListener("submit", enviarSolicitud);
}

function marcarError(input, msg) {
  const field = input.closest(".field");
  field.classList.add("invalid");
  let m = $(".error-msg", field);
  if (!m) { m = document.createElement("small"); m.className = "error-msg"; field.appendChild(m); }
  m.textContent = msg;
}
function limpiarError(field) {
  field.classList.remove("invalid");
  $(".error-msg", field)?.remove();
}
form.addEventListener("input", e => {
  const f = e.target.closest(".field");
  if (f) limpiarError(f);
});

async function actualizarDisponibilidad() {
  const fecha = $("#fecha").value;
  const box = $("#disponibilidad");
  $("#alertaChoque").hidden = true;

  if (!fecha) {
    box.innerHTML = `<span class="muted">Seleccione una fecha para ver la disponibilidad de la sala.</span>`;
    return;
  }
  const dow = parseISO(fecha).getDay();
  if (!CONFIG.DIAS_HABILES.includes(dow)) {
    box.innerHTML = `<span class="slot slot-busy">La sala no presta servicio los ${DIAS[dow].toLowerCase()}s</span>`;
    return;
  }

  await cargar();
  const delDia = state.reservas
    .filter(r => r.fecha === fecha && r.estado !== "rechazada")
    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

  const chips = delDia.map(r => r.estado === "aprobada"
    ? `<span class="slot slot-busy">⛔ ${esc(rango(r))} · Ocupada</span>`
    : `<span class="slot slot-pend">⏳ ${esc(rango(r))} · Solicitud pendiente</span>`).join("");

  box.innerHTML = `
    <h4>Disponibilidad — ${esc(fechaLarga(fecha))}</h4>
    <div class="slots">
      ${chips || `<span class="slot slot-free">✅ Sala libre todo el día (${hora12(CONFIG.HORA_APERTURA)} – ${hora12(CONFIG.HORA_CIERRE)})</span>`}
    </div>`;

  const ini = $("#horaInicio").value, fin = $("#horaFin").value;
  if (ini && fin && ini < fin) {
    const choque = aprobadas().find(r => seCruzan(r, { fecha, horaInicio: ini, horaFin: fin }));
    if (choque) mostrarChoque(choque);
  }
}

function mostrarChoque(r) {
  const al = $("#alertaChoque");
  al.innerHTML = `⛔ <span><strong>Horario ocupado.</strong> La sala ya está reservada el ${esc(fechaLarga(r.fecha))} de ${esc(rango(r))} para «${esc(r.tema)}». Por favor elija otro horario.</span>`;
  al.hidden = false;
  al.scrollIntoView({ behavior: "smooth", block: "center" });
}

function validar() {
  let ok = true;
  const v = id => $("#" + id).value.trim();
  const err = (id, msg) => { marcarError($("#" + id), msg); ok = false; };

  if (v("tema").length < 4) err("tema", "Escriba el tema de la reunión.");
  if (v("departamento").length < 3) err("departamento", "Escriba el departamento.");
  if (v("descripcion").length < 10) err("descripcion", "Describa la reunión (mínimo 10 caracteres).");

  const fecha = v("fecha"), ini = v("horaInicio"), fin = v("horaFin");
  if (!fecha) err("fecha", "Seleccione la fecha.");
  else if (fecha < toISO(new Date())) err("fecha", "La fecha no puede ser anterior a hoy.");
  else if (!CONFIG.DIAS_HABILES.includes(parseISO(fecha).getDay())) err("fecha", "La sala no presta servicio ese día.");

  if (!ini) err("horaInicio", "Indique la hora de inicio.");
  if (!fin) err("horaFin", "Indique la hora de finalización.");
  if (ini && fin) {
    if (fin <= ini) err("horaFin", "Debe ser posterior a la hora de inicio.");
    if (ini < CONFIG.HORA_APERTURA || fin > CONFIG.HORA_CIERRE)
      err("horaInicio", `Horario permitido: ${hora12(CONFIG.HORA_APERTURA)} a ${hora12(CONFIG.HORA_CIERRE)}.`);
    if (fecha === toISO(new Date())) {
      const ahora = new Date();
      if (ini < `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`) err("horaInicio", "Esa hora ya pasó.");
    }
  }

  if (!/^\d{5,12}$/.test(v("cc"))) err("cc", "Cédula inválida (solo números, 5 a 12 dígitos).");
  if (v("nombre").split(/\s+/).length < 2) err("nombre", "Escriba nombre y apellido.");
  if (v("telefono").replace(/\D/g, "").length < 7) err("telefono", "Teléfono inválido.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v("correo"))) err("correo", "Correo electrónico inválido.");

  if (!ok) $(".field.invalid", form)?.scrollIntoView({ behavior: "smooth", block: "center" });
  return ok;
}

async function enviarSolicitud(e) {
  e.preventDefault();
  $("#alertaChoque").hidden = true;
  if (!validar()) return;

  const btn = $("#btnEnviar");
  const btnHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Enviando…`;

  try {
    const fd = Object.fromEntries(new FormData(form));
    const reserva = {
      id: "R" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(),
      tema: fd.tema.trim(),
      departamento: fd.departamento.trim(),
      asistentes: fd.asistentes || "",
      descripcion: fd.descripcion.trim(),
      fecha: fd.fecha,
      horaInicio: fd.horaInicio,
      horaFin: fd.horaFin,
      cc: fd.cc.trim(),
      nombre: fd.nombre.trim(),
      telefono: fd.telefono.trim(),
      correo: fd.correo.trim().toLowerCase(),
      estado: "pendiente",
      creada: new Date().toISOString()
    };

    // Verificación final contra datos actualizados
    await cargar();
    const choque = aprobadas().find(r => seCruzan(r, reserva));
    if (choque) { mostrarChoque(choque); return; }
    const pendienteCruzada = state.reservas.some(r => r.estado === "pendiente" && seCruzan(r, reserva));

    await Store.save(reserva);
    form.reset();

    abrirModal(`
      <div style="text-align:center">
        <div style="font-size:3rem">✅</div>
        <h3 style="padding:0">¡Solicitud enviada!</h3>
        <p class="muted">Su solicitud quedó <strong>pendiente de aprobación</strong> por la administración. Cuando sea aprobada aparecerá en el cronograma.</p>
        <p style="margin-top:14px">Código de solicitud:<br><strong style="font-size:1.3rem;color:var(--primary);letter-spacing:.05em">${esc(reserva.id)}</strong></p>
        ${pendienteCruzada ? `<div class="alert alert-warn" style="text-align:left">⚠️ Existe otra solicitud pendiente en un horario que se cruza. La administración decidirá cuál aprobar.</div>` : ""}
        <p class="muted" style="font-size:.85rem;margin-top:14px">Puede consultar el estado en «Mis solicitudes» con su cédula.</p>
      </div>
      <div class="modal-actions" style="justify-content:center">
        <button class="btn btn-ghost" data-close data-go="cronograma">Ver cronograma</button>
        <button class="btn btn-primary" data-close>Aceptar</button>
      </div>`);
  } catch (err) {
    toast("No se pudo enviar la solicitud: " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnHTML;
  }
}

/* ---------------- Cronograma ---------------- */
function diasSemana() {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(state.semana, i);
    if (CONFIG.DIAS_HABILES.includes(d.getDay())) dias.push(d);
  }
  return dias;
}

function tituloSemana(dias) {
  const a = dias[0], b = dias[dias.length - 1];
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} de ${MESES[a.getMonth()]} ${a.getFullYear()}`
    : `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
}

async function renderCalendario() {
  const cont = $("#calendario");
  const dias = diasSemana();
  $("#semTitulo").textContent = tituloSemana(dias);
  $$(".segmented button").forEach(b => b.classList.toggle("active", b.dataset.vista === state.vista));
  cont.innerHTML = `<div class="loading">Cargando cronograma…</div>`;
  await cargar();
  cont.innerHTML = state.vista === "semana" ? htmlSemana(dias) : htmlLista(dias);
}

function htmlSemana(dias) {
  const ini = toMin(CONFIG.HORA_APERTURA), fin = toMin(CONFIG.HORA_CIERRE);
  const ppm = HOUR_H / 60;
  const alto = (fin - ini) * ppm;
  const hoy = toISO(new Date());
  const ahora = new Date();
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();

  let horas = "";
  for (let m = ini; m < fin; m += 60) horas += `<div class="tl">${hora12(`${pad(m / 60 | 0)}:${pad(m % 60)}`)}</div>`;

  const head = `<div class="wh-cell"></div>` + dias.map(d => `
    <div class="wh-cell ${toISO(d) === hoy ? "today" : ""}">
      <span class="wd">${DIAS[d.getDay()].slice(0, 3)}</span>
      <span class="dn">${d.getDate()}</span>
    </div>`).join("");

  const cols = dias.map(d => {
    const iso = toISO(d);
    const evs = aprobadas().filter(r => r.fecha === iso).map(r => {
      const top = (toMin(r.horaInicio) - ini) * ppm;
      const h = Math.max((toMin(r.horaFin) - toMin(r.horaInicio)) * ppm, 22);
      return `
        <div class="event" data-id="${esc(r.id)}" style="top:${top}px;height:${h}px;background:${colorDe(r.departamento)}" title="${esc(r.tema)}">
          <div class="ev-time">${esc(r.horaInicio)} – ${esc(r.horaFin)}</div>
          <div class="ev-title">${esc(r.tema)}</div>
          ${h > 60 ? `<div class="ev-dep">${esc(r.departamento)}</div>` : ""}
        </div>`;
    }).join("");
    const nowLine = iso === hoy && ahoraMin >= ini && ahoraMin <= fin
      ? `<div class="now-line" style="top:${(ahoraMin - ini) * ppm}px"></div>` : "";
    return `<div class="day-col ${iso === hoy ? "today" : iso < hoy ? "past" : ""}" style="height:${alto}px">${nowLine}${evs}</div>`;
  }).join("");

  return `
    <div class="week-scroll">
      <div class="week" style="grid-template-columns:84px repeat(${dias.length}, minmax(120px, 1fr))">
        ${head}
        <div class="time-col" style="height:${alto}px">${horas}</div>
        ${cols}
      </div>
    </div>`;
}

function htmlLista(dias) {
  const hoy = toISO(new Date());
  const bloques = dias.map(d => {
    const iso = toISO(d);
    const evs = aprobadas().filter(r => r.fecha === iso).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
    if (!evs.length) return "";
    return `
      <div class="agenda-day">
        <h4>${esc(fechaLarga(iso))} ${iso === hoy ? `<span class="tag-today">Hoy</span>` : ""}</h4>
        ${evs.map(r => `
          <div class="agenda-item" data-id="${esc(r.id)}">
            <span class="bar" style="background:${colorDe(r.departamento)}"></span>
            <span class="a-time">${esc(rango(r))}</span>
            <span>
              <div class="a-title">${esc(r.tema)}</div>
              <div class="a-meta">${esc(r.departamento)} · ${esc(r.nombre)}</div>
            </span>
          </div>`).join("")}
      </div>`;
  }).join("");

  return bloques ? `<div class="agenda">${bloques}</div>` : `
    <div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      <p>No hay reuniones aprobadas para esta semana.</p>
    </div>`;
}

$("#calendario").addEventListener("click", e => {
  const ev = e.target.closest("[data-id]");
  if (ev) verDetalle(ev.dataset.id);
});
$("#semAnterior").addEventListener("click", () => { state.semana = addDays(state.semana, -7); renderCalendario(); });
$("#semSiguiente").addEventListener("click", () => { state.semana = addDays(state.semana, 7); renderCalendario(); });
$("#semHoy").addEventListener("click", () => { state.semana = inicioSemana(new Date()); renderCalendario(); });
$$(".segmented button").forEach(b => b.addEventListener("click", () => { state.vista = b.dataset.vista; renderCalendario(); }));

/* ---------------- Mis solicitudes ---------------- */
$("#ccConsulta").addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, ""); });
$("#formConsulta").addEventListener("submit", async e => {
  e.preventDefault();
  const cc = $("#ccConsulta").value.trim();
  const out = $("#resultadoConsulta");
  if (!cc) return;
  out.innerHTML = `<div class="loading">Buscando…</div>`;
  await cargar();
  const mias = state.reservas.filter(r => r.cc === cc).sort((a, b) => b.creada.localeCompare(a.creada));
  out.innerHTML = mias.length
    ? mias.map(r => tarjetaSolicitud(r, false)).join("")
    : `<div class="card empty"><p>No se encontraron solicitudes para la cédula ${esc(cc)}.</p></div>`;
});

/* ---------------- Tarjeta de solicitud ---------------- */
function tarjetaSolicitud(r, admin) {
  const choques = admin && r.estado === "pendiente"
    ? aprobadas().filter(a => seCruzan(a, r)) : [];
  const otrasPend = admin && r.estado === "pendiente"
    ? state.reservas.filter(p => p.id !== r.id && p.estado === "pendiente" && seCruzan(p, r)) : [];

  return `
    <article class="card req-card">
      <div class="req-top">
        <div>
          <h3>${esc(r.tema)}</h3>
          <small class="muted">${esc(r.departamento)} · Código ${esc(r.id)}</small>
        </div>
        <span class="status st-${r.estado}">${esc(r.estado)}</span>
      </div>
      <div class="req-when">
        <span>📅 ${esc(fechaLarga(r.fecha))}</span>
        <span>🕒 ${esc(rango(r))}</span>
        ${r.asistentes ? `<span>👥 ${esc(r.asistentes)} asistentes</span>` : ""}
      </div>
      <div class="req-desc">${esc(r.descripcion)}</div>
      ${admin ? `
      <div class="kv">
        <div><small>C.C.</small><span>${esc(r.cc)}</span></div>
        <div><small>Nombre completo</small><span>${esc(r.nombre)}</span></div>
        <div><small>Teléfono</small><span><a href="tel:${esc(r.telefono)}">${esc(r.telefono)}</a></span></div>
        <div><small>Correo</small><span><a href="mailto:${esc(r.correo)}">${esc(r.correo)}</a></span></div>
      </div>` : ""}
      ${r.estado === "rechazada" && r.motivo ? `<div class="alert alert-error">Motivo del rechazo: ${esc(r.motivo)}</div>` : ""}
      ${choques.length ? `<div class="alert alert-error conflict-note">⛔ Se cruza con una reunión ya aprobada: «${esc(choques[0].tema)}» (${esc(rango(choques[0]))}). No se puede aprobar.</div>` : ""}
      ${otrasPend.length ? `<div class="alert alert-warn conflict-note">⚠️ Hay ${otrasPend.length} solicitud(es) pendiente(s) en un horario que se cruza.</div>` : ""}
      <div class="req-foot">Solicitada el ${esc(new Date(r.creada).toLocaleString("es-CO"))}${r.revisada ? ` · Revisada el ${esc(new Date(r.revisada).toLocaleString("es-CO"))}` : ""}</div>
      ${admin ? `
      <div class="req-actions">
        ${r.estado === "pendiente" ? `
          <button class="btn btn-danger btn-sm" data-accion="rechazar" data-id="${esc(r.id)}">Rechazar</button>
          <button class="btn btn-ok btn-sm" data-accion="aprobar" data-id="${esc(r.id)}" ${choques.length ? "disabled" : ""}>✓ Aprobar</button>` : ""}
        ${r.estado === "aprobada" ? `<button class="btn btn-danger btn-sm" data-accion="cancelar" data-id="${esc(r.id)}">Cancelar reunión</button>` : ""}
        ${r.estado !== "pendiente" ? `<button class="btn btn-ghost btn-sm" data-accion="eliminar" data-id="${esc(r.id)}">Eliminar</button>` : ""}
      </div>` : ""}
    </article>`;
}

/* ---------------- Administración ---------------- */
const SESSION_KEY = "salaJuntas.admin";

async function sha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
// Ayuda para cambiar la contraseña desde la consola del navegador
window.generarHash = sha256;

const esAdmin = () => { try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; } };

$("#formLogin").addEventListener("submit", async e => {
  e.preventDefault();
  const hash = await sha256($("#adminPass").value);
  if (hash === CONFIG.ADMIN_PASSWORD_SHA256) {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
    $("#adminPass").value = "";
    $("#loginError").hidden = true;
    renderAdmin();
  } else {
    $("#loginError").hidden = false;
  }
});
$("#btnSalir").addEventListener("click", () => {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  renderAdmin();
});
$("#btnRefrescar").addEventListener("click", () => renderAdmin());
$$("#adminTabs button").forEach(b => b.addEventListener("click", () => {
  state.adminTab = b.dataset.tab;
  $$("#adminTabs button").forEach(x => x.classList.toggle("active", x === b));
  renderListaAdmin();
}));
$("#adminBuscar").addEventListener("input", () => renderListaAdmin());

async function renderAdmin() {
  const logged = esAdmin();
  $("#adminLogin").hidden = logged;
  $("#adminPanel").hidden = !logged;
  if (!logged) return;

  $("#adminLista").innerHTML = `<div class="loading">Cargando solicitudes…</div>`;
  await cargar();

  const cuenta = est => state.reservas.filter(r => r.estado === est).length;
  const sem = inicioSemana(new Date());
  const semIni = toISO(sem), semFin = toISO(addDays(sem, 6));
  $("#stPend").textContent = $("#badgePend").textContent = cuenta("pendiente");
  $("#stApr").textContent = cuenta("aprobada");
  $("#stRech").textContent = cuenta("rechazada");
  $("#stSem").textContent = aprobadas().filter(r => r.fecha >= semIni && r.fecha <= semFin).length;

  renderListaAdmin();
}

function renderListaAdmin() {
  const q = $("#adminBuscar").value.trim().toLowerCase();
  const lista = state.reservas
    .filter(r => r.estado === state.adminTab)
    .filter(r => !q || [r.tema, r.nombre, r.cc, r.departamento, r.correo, r.id].join(" ").toLowerCase().includes(q))
    .sort((a, b) => state.adminTab === "pendiente"
      ? (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio)
      : (b.fecha + b.horaInicio).localeCompare(a.fecha + a.horaInicio));

  $("#adminLista").innerHTML = lista.length
    ? lista.map(r => tarjetaSolicitud(r, true)).join("")
    : `<div class="card empty"><p>No hay solicitudes ${esc(state.adminTab === "pendiente" ? "pendientes" : state.adminTab + "s")}.</p></div>`;
}

$("#adminLista").addEventListener("click", async e => {
  const btn = e.target.closest("[data-accion]");
  if (!btn) return;
  const { accion, id } = btn.dataset;
  const r = state.reservas.find(x => x.id === id);
  if (!r) return;

  try {
    if (accion === "aprobar") await aprobar(r);
    if (accion === "rechazar") pedirMotivo(r, "rechazar");
    if (accion === "cancelar") pedirMotivo(r, "cancelar");
    if (accion === "eliminar" && confirm(`¿Eliminar definitivamente la solicitud «${r.tema}»?`)) {
      await Store.remove(id);
      toast("Solicitud eliminada.", "ok");
      renderAdmin();
    }
  } catch (err) {
    toast(err.message, "err");
  }
});

async function aprobar(r) {
  await cargar(); // datos frescos antes de aprobar
  const choque = aprobadas().find(a => a.id !== r.id && seCruzan(a, r));
  if (choque) {
    toast(`No se puede aprobar: se cruza con «${choque.tema}» (${rango(choque)}).`, "err");
    return renderAdmin();
  }
  const ahora = new Date().toISOString();
  await Store.update(r.id, { estado: "aprobada", revisada: ahora });

  const cruzadas = state.reservas.filter(p => p.id !== r.id && p.estado === "pendiente" && seCruzan(p, r));
  if (cruzadas.length && confirm(`Hay ${cruzadas.length} solicitud(es) pendiente(s) que se cruzan con este horario.\n¿Desea rechazarlas automáticamente?`)) {
    await Promise.all(cruzadas.map(p => Store.update(p.id, {
      estado: "rechazada", revisada: ahora, motivo: "El horario fue asignado a otra reunión."
    })));
  }
  toast(`Reunión «${r.tema}» aprobada y publicada en el cronograma.`, "ok");
  renderAdmin();
}

function pedirMotivo(r, tipo) {
  const titulo = tipo === "rechazar" ? "Rechazar solicitud" : "Cancelar reunión aprobada";
  abrirModal(`
    <h3>${titulo}</h3>
    <p class="muted">«${esc(r.tema)}» — ${esc(fechaLarga(r.fecha))}, ${esc(rango(r))}</p>
    <div class="field" style="margin-top:14px">
      <label for="motivoTxt">Motivo (visible para el solicitante)</label>
      <textarea id="motivoTxt" rows="3" maxlength="300" placeholder="Opcional"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-close>Volver</button>
      <button class="btn btn-danger" id="confirmarMotivo">${tipo === "rechazar" ? "Rechazar" : "Cancelar reunión"}</button>
    </div>`);
  $("#confirmarMotivo").addEventListener("click", async () => {
    try {
      await Store.update(r.id, {
        estado: "rechazada",
        revisada: new Date().toISOString(),
        motivo: $("#motivoTxt").value.trim() || (tipo === "cancelar" ? "Reunión cancelada por la administración." : "")
      });
      cerrarModal();
      toast(tipo === "rechazar" ? "Solicitud rechazada." : "Reunión cancelada.", "ok");
      renderAdmin();
    } catch (err) {
      toast(err.message, "err");
    }
  });
}

/* ---------------- Inicio de la app ---------------- */
(function init() {
  document.title = `${CONFIG.NOMBRE_SALA} · Reservas`;
  $("#brandSala").textContent = CONFIG.NOMBRE_SALA;
  $("#brandEntidad").textContent = CONFIG.ENTIDAD;
  $("#footerTxt").textContent = `${CONFIG.NOMBRE_SALA} · ${CONFIG.ENTIDAD} · Horario ${hora12(CONFIG.HORA_APERTURA)} – ${hora12(CONFIG.HORA_CIERRE)}`;
  initFormulario();
  mostrar(location.hash.slice(1) || "inicio");
})();
