"""
Envío de avisos push (Web Push) de la Sala de Juntas.

Lo ejecuta GitHub Actions cada ~5 minutos (.github/workflows/avisos.yml).
Lee Firebase y envía a los navegadores registrados (avisos/subs):
  - "nueva":        a los administradores, por cada solicitud pendiente nueva.
  - "aprobada" / "rechazada" / "cancelada": al navegador del solicitante.
  - "recordatorio": al solicitante, RECORDATORIO_MIN minutos antes de su reunión.
Cada envío queda marcado en avisos/enviados/<reserva>/<tipo>/<navegador>
para no repetirlo (la página abierta usa las mismas marcas).

Variables de entorno:
  VAPID_PRIVATE_KEY  (obligatoria) llave privada VAPID, secreto del repositorio
  SITE_URL           (opcional) URL pública; por defecto https://<dueño>.github.io/<repo>/
  FIREBASE_URL       (opcional) por defecto se lee de js/config.js
  DRY_RUN=1          (opcional) muestra lo que enviaría sin enviar ni marcar
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CFG = (ROOT / "js" / "config.js").read_text(encoding="utf-8")


def cfg(nombre, defecto=""):
    m = re.search(rf'^\s*{nombre}\s*:\s*("([^"]*)"|[\d.]+)', CFG, re.M)
    if not m:
        return defecto
    return m.group(2) if m.group(2) is not None else m.group(1)


FIREBASE = (os.environ.get("FIREBASE_URL") or cfg("FIREBASE_URL")).strip().rstrip("/")
NOMBRE_SALA = cfg("NOMBRE_SALA", "Sala de Juntas")
RECORDATORIO_MIN = int(float(cfg("RECORDATORIO_MIN", "0") or 0))
PRIVADA = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
DRY_RUN = os.environ.get("DRY_RUN") == "1"
COLOMBIA = timezone(timedelta(hours=-5))  # hora de Colombia (sin horario de verano)
MAX_EDAD = timedelta(days=2)              # no se avisan eventos más viejos que esto
SUBS_VENCEN = timedelta(days=120)         # navegadores de solicitantes sin visitas se borran


def site_url():
    if os.environ.get("SITE_URL"):
        return os.environ["SITE_URL"].rstrip("/") + "/"
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if "/" in repo:
        dueno, nombre = repo.split("/", 1)
        return f"https://{dueno.lower()}.github.io/{nombre}/"
    return ""


SITE = site_url()
# Contacto VAPID: el origen del sitio (sin ruta), p. ej. https://usuario.github.io
SUBJECT = os.environ.get("VAPID_SUBJECT") or (re.match(r"https://[^/]+", SITE).group(0) if SITE else "mailto:avisos@example.com")


# ---------------------------------------------------------------- Firebase
def fb(path, method="GET", body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{FIREBASE}/{path}.json", data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read() or b"null")


# ---------------------------------------------------------------- Fechas y textos
def iso(dt):
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def hora12(hhmm):
    h, m = (int(x) for x in str(hhmm or "0:0").split(":")[:2])
    return f"{h % 12 or 12}:{m:02d} {'p. m.' if h >= 12 else 'a. m.'}"


def fecha_corta(f):
    d = datetime.strptime(f, "%Y-%m-%d")
    return f"{DIAS[d.weekday()]} {d.day} {MESES[d.month - 1]}"


def cuando(r):
    return f"{fecha_corta(r['fecha'])} · {hora12(r['horaInicio'])} – {hora12(r['horaFin'])}"


def mensaje(tipo, r):
    motivo = f"\nMotivo: {r['motivo']}" if r.get("motivo") else ""
    tema = r.get("tema", "")
    return {
        "nueva": {"title": "📩 Nueva solicitud de sala",
                  "body": f"«{tema}»\n{cuando(r)}\nSolicita: {r.get('nombre', '')}",
                  "url": "#admin", "tag": f"nueva-{r['id']}"},
        "aprobada": {"title": "✅ Reunión aprobada",
                     "body": f"«{tema}»\n{cuando(r)}\nYa está publicada en el cronograma.",
                     "url": "#consultar", "tag": f"estado-{r['id']}"},
        "rechazada": {"title": "❌ Solicitud no aprobada",
                      "body": f"«{tema}»\n{cuando(r)}{motivo}",
                      "url": "#consultar", "tag": f"estado-{r['id']}"},
        "cancelada": {"title": "⚠️ Reunión cancelada",
                      "body": f"«{tema}»\n{cuando(r)}{motivo}",
                      "url": "#consultar", "tag": f"estado-{r['id']}"},
        "recordatorio": {"title": "⏰ Su reunión empieza pronto",
                         "body": f"«{tema}»\nHoy · {hora12(r['horaInicio'])} – {hora12(r['horaFin'])}\nSala {NOMBRE_SALA}",
                         "url": "#cronograma", "tag": f"recordatorio-{r['id']}"},
    }[tipo]


# ---------------------------------------------------------------- Eventos
def eventos(r, subs, ahora):
    """Devuelve [(tipo, sub_id)] que corresponden a esta solicitud."""
    out = []
    limite = iso(ahora - MAX_EDAD)
    propios = r.get("subs") or {}
    estado = r.get("estado")

    if estado == "pendiente" and r.get("creada", "") >= limite:
        for sid, s in subs.items():
            if s.get("admin") and sid not in propios and r["creada"] >= s.get("creado", ""):
                out.append(("nueva", sid))

    revisada = r.get("revisada", "")
    if estado in ("aprobada", "rechazada") and revisada >= limite:
        tipo = "aprobada" if estado == "aprobada" else ("cancelada" if r.get("cancelada") else "rechazada")
        for sid, desde in propios.items():
            if sid in subs and (not isinstance(desde, str) or revisada >= desde):
                out.append((tipo, sid))

    if RECORDATORIO_MIN and estado == "aprobada":
        local = ahora.astimezone(COLOMBIA)
        try:
            inicio = datetime.strptime(f"{r['fecha']} {r['horaInicio']}", "%Y-%m-%d %H:%M").replace(tzinfo=COLOMBIA)
        except (KeyError, ValueError):
            inicio = None
        if inicio and inicio - timedelta(minutes=RECORDATORIO_MIN) <= local < inicio:
            out.extend(("recordatorio", sid) for sid in propios if sid in subs)
    return out


def main():
    if not FIREBASE:
        print("Sin FIREBASE_URL: nada que hacer.")
        return
    if not PRIVADA and not DRY_RUN:
        print("::warning::Falta el secreto VAPID_PRIVATE_KEY en el repositorio. No se envían avisos push.")
        return
    if not DRY_RUN:
        from pywebpush import WebPushException, webpush

    ahora = datetime.now(timezone.utc)
    try:
        reservas = fb("reservas") or {}
        avisos = fb("avisos") or {}
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            print("::warning::Firebase no permite leer el nodo «avisos». Actualice las reglas (ver README).")
            return
        raise
    subs = {k: v for k, v in (avisos.get("subs") or {}).items() if isinstance(v, dict) and v.get("endpoint")}
    enviados = avisos.get("enviados") or {}

    enviados_ok, fallidos, borrados = 0, 0, set()
    for rid, r in reservas.items():
        if not isinstance(r, dict) or not r.get("fecha"):
            continue
        r.setdefault("id", rid)
        for tipo, sid in eventos(r, subs, ahora):
            if sid in borrados or (enviados.get(rid) or {}).get(tipo, {}).get(sid):
                continue
            s = subs[sid]
            msg = mensaje(tipo, r)
            msg["url"] = SITE + msg["url"]
            if DRY_RUN:
                print(f"[prueba] {tipo:<12} {rid} -> {sid} ({s.get('equipo', '')}): {msg['title']}")
                continue
            try:
                webpush(
                    subscription_info={"endpoint": s["endpoint"], "keys": s.get("keys", {})},
                    data=json.dumps(msg, ensure_ascii=False),
                    vapid_private_key=PRIVADA,
                    vapid_claims={"sub": SUBJECT},  # dict nuevo en cada envío (pywebpush lo modifica)
                    ttl=3600 if tipo == "recordatorio" else 86400,
                    headers={"Urgency": "high"},
                    timeout=15,
                )
                fb(f"avisos/enviados/{rid}/{tipo}", "PATCH", {sid: True})
                enviados.setdefault(rid, {}).setdefault(tipo, {})[sid] = True
                enviados_ok += 1
                print(f"enviado   {tipo:<12} {rid} -> {sid} ({s.get('equipo', '')})")
            except WebPushException as e:
                code = getattr(e.response, "status_code", None)
                if code in (404, 410):  # el navegador ya no existe: se borra
                    fb(f"avisos/subs/{sid}", "DELETE")
                    borrados.add(sid)
                    print(f"borrado   {sid}: suscripción vencida ({code})")
                else:
                    fallidos += 1
                    print(f"::warning::No se pudo enviar {tipo} {rid} -> {sid}: {code} {e}")

    # Limpieza: marcas de solicitudes que ya no existen y navegadores abandonados
    if not DRY_RUN:
        for rid in set(enviados) - set(reservas):
            fb(f"avisos/enviados/{rid}", "DELETE")
        vencen = iso(ahora - SUBS_VENCEN)
        for sid, s in subs.items():
            if sid not in borrados and not s.get("admin") and s.get("visto", s.get("creado", "")) < vencen:
                fb(f"avisos/subs/{sid}", "DELETE")
                print(f"borrado   {sid}: sin visitas en {SUBS_VENCEN.days} días")

    print(f"Listo: {len(reservas)} solicitudes, {len(subs)} navegadores, {enviados_ok} avisos enviados, {fallidos} fallidos.")
    if fallidos and not enviados_ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
