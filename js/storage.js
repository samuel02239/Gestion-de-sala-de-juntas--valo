/* =========================================================
   ALMACENAMIENTO DE RESERVAS
   - Sin FIREBASE_URL: localStorage (solo este navegador)
   - Con FIREBASE_URL: Firebase Realtime Database (compartido)
   ========================================================= */
const Store = (() => {
  const KEY = "salaJuntas.reservas";
  const remoteUrl = () => (CONFIG.FIREBASE_URL || "").trim().replace(/\/+$/, "");

  async function request(path, method = "GET", body) {
    const res = await fetch(`${remoteUrl()}/${path}.json`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(`No se pudo conectar con la base de datos (${res.status})`);
    return res.json();
  }

  const local = {
    read() {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
      catch { return {}; }
    },
    write(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
  };

  return {
    isShared: () => Boolean(remoteUrl()),

    async all() {
      const data = remoteUrl() ? await request("reservas") : local.read();
      return Object.values(data || {});
    },

    async save(reserva) {
      if (remoteUrl()) return request(`reservas/${reserva.id}`, "PUT", reserva);
      const data = local.read();
      data[reserva.id] = reserva;
      local.write(data);
    },

    async update(id, patch) {
      if (remoteUrl()) return request(`reservas/${id}`, "PATCH", patch);
      const data = local.read();
      if (data[id]) data[id] = { ...data[id], ...patch };
      local.write(data);
    },

    async remove(id) {
      if (remoteUrl()) return request(`reservas/${id}`, "DELETE");
      const data = local.read();
      delete data[id];
      local.write(data);
    }
  };
})();
