/* =========================================================
   CONFIGURACIÓN DEL SISTEMA — Edite aquí sus preferencias
   ========================================================= */
const CONFIG = {
  NOMBRE_SALA: "Valorización Distrital",
  ENTIDAD: "Alcaldía de Cartagena",

  // Horario de atención de la sala (formato 24h)
  HORA_APERTURA: "07:00",
  HORA_CIERRE: "18:00",

  // Días hábiles: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
  DIAS_HABILES: [1, 2, 3, 4, 5],

  // Las reuniones se borran automáticamente cuando pasan estos días después de su fecha
  DIAS_CONSERVAR: 5,

  // Contraseña del administrador guardada como hash SHA-256.
  // Para cambiarla: abra la página, presione F12 > Consola y escriba:
  //   await generarHash("SuNuevaClave")
  // Copie el resultado y péguelo aquí (NO escriba la clave directamente).
  ADMIN_PASSWORD_SHA256: "bda73c0b2296731d57bdbc1a08aa24244ea7e29b93551da4d3b2ad1aff03763c",

  // ---------------------------------------------------------
  // BASE DE DATOS COMPARTIDA (recomendado al publicar en GitHub)
  // Vacío  -> los datos se guardan solo en el navegador (modo prueba).
  // Con URL -> todos los usuarios comparten las mismas reservas.
  // Ejemplo: "https://sala-juntas-xxxxx-default-rtdb.firebaseio.com"
  // Ver README.md para crearla gratis en Firebase.
  // ---------------------------------------------------------
  FIREBASE_URL: "https://gestion-de-oficina-c6a3b-default-rtdb.firebaseio.com",

  // ---------------------------------------------------------
  // AVISOS AL NAVEGADOR (notificaciones push)
  // Llave pública VAPID. La llave PRIVADA va solo en el secreto
  // VAPID_PRIVATE_KEY de GitHub (Settings > Secrets > Actions).
  // Vacío -> los avisos quedan desactivados.
  // ---------------------------------------------------------
  VAPID_PUBLIC_KEY: "BD7cNMefx50BbFuoXWTtMuR2RdpTkvJYwBf9BSxdo_CVWfvptPL916CwmTK1HUiyWsU92W0IstdS7AS3GnzjRZA",

  // Recordatorio al solicitante: minutos antes de que empiece su reunión aprobada (0 = desactivado)
  RECORDATORIO_MIN: 60
};
