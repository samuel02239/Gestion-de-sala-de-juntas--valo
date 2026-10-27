/* =========================================================
   CONFIGURACIÓN DEL SISTEMA — Edite aquí sus preferencias
   ========================================================= */
const CONFIG = {
  NOMBRE_SALA: "Valorización Distrital",
  ENTIDAD: "Alcaldía",

  // Logo: ponga logo.png o logo.jpg junto a index.html (se prueba en este orden)
  LOGOS: ["logo.png", "logo.jpg", "logo.jpeg"],

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
  FIREBASE_URL: "https://gestion-de-oficina-c6a3b-default-rtdb.firebaseio.com"
};
