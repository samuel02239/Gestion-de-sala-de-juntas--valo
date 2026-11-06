# Sala de Juntas — Sistema de reservas

Aplicación web para solicitar, aprobar y publicar las reuniones de la Sala de Juntas.

## Funciones

- **Registrar reunión**: tema, descripción, fecha, horario y datos de la persona a cargo (nombre completo, teléfono, correo).
- **Disponibilidad en vivo**: al elegir una fecha se muestran los horarios ocupados. Si el horario elegido se cruza con una reunión aprobada, el sistema muestra **"Horario ocupado"** y no permite enviar la solicitud.
- **Ver cronograma**: vista semanal (tipo calendario) y vista de lista. Solo muestra las reuniones **aprobadas**.
- **Mis solicitudes**: muestra sola las solicitudes hechas desde ese navegador; también se puede consultar con el correo electrónico.
- **Avisos al navegador** 🔔: el administrador recibe un aviso por cada solicitud nueva y el solicitante recibe un aviso cuando su reunión se aprueba, se rechaza o se cancela, más un recordatorio antes de empezar. Funcionan aunque la página esté cerrada (ver más abajo).
- **Administración** (con contraseña): aprobar, rechazar con motivo, cancelar o eliminar reuniones. El sistema no deja aprobar dos reuniones que se crucen.
- **Varios equipos en vivo**: con la base de datos configurada, los cambios hechos en un computador aparecen solos en los demás (el pie de página indica «En vivo»).
- **Diseño adaptable**: funciona en celular, tableta, portátil y monitores grandes.

## Estructura

```
index.html        Página principal
css/styles.css    Diseño (colores tomados de los logos: mar, agua, sol, coral y palma)
img/              Escudo, logo de Valorización Distrital y sticker «Cartagena se valoriza»
js/config.js      ⚙️ Configuración (horario, contraseña, base de datos)
js/storage.js     Guardado de datos (navegador o Firebase)
js/data.js        Sincronización en tiempo real entre equipos
js/avisos.js      Avisos al navegador (permiso, registro y avisos instantáneos)
js/app.js         Lógica de la aplicación
sw.js             Service worker: recibe los avisos con la página cerrada
manifest.json     Permite instalar la página como app (necesario en iPhone)
scripts/enviar_avisos.py        Envía los avisos push (lo ejecuta GitHub Actions)
.github/workflows/avisos.yml    Tarea programada cada 5 minutos
```

## Contraseña de administrador

Para cambiarla:
1. Abra la página en el navegador y presione **F12** → pestaña **Consola**.
2. Escriba: `await generarHash("MiNuevaClave")` y presione Enter.
3. Copie el texto que aparece y péguelo en `ADMIN_PASSWORD_SHA256` dentro de `js/config.js`.

## Borrado automático

Las reuniones (y solicitudes) se eliminan solas **5 días después de la fecha de la reunión**. Se puede cambiar en `DIAS_CONSERVAR` dentro de `js/config.js`.

## ⚠️ Importante: dónde se guardan los datos

GitHub Pages solo publica archivos; **no tiene servidor ni base de datos**.

| Modo | Configuración | Resultado |
|---|---|---|
| Prueba | `FIREBASE_URL: ""` | Los datos quedan solo en el navegador de cada persona. El administrador **no** verá las solicitudes hechas desde otros computadores. |
| Compartido ✅ | `FIREBASE_URL: "https://..."` | Todos ven las mismas solicitudes y el mismo cronograma. |

### Crear la base de datos gratuita (Firebase), unos 5 minutos

1. Entre a <https://console.firebase.google.com> con una cuenta de Google → **Crear proyecto** (ej: `sala-juntas`).
2. En el menú: **Compilación → Realtime Database → Crear base de datos** → ubicación `us-central1` → **Comenzar en modo de prueba**.
3. Copie la URL que aparece arriba (ej: `https://sala-juntas-xxxxx-default-rtdb.firebaseio.com`).
4. Péguela en `js/config.js`:
   ```js
   FIREBASE_URL: "https://sala-juntas-xxxxx-default-rtdb.firebaseio.com"
   ```
5. En la pestaña **Reglas** de la base de datos coloque lo siguiente y publique (el modo prueba expira a los 30 días):
   ```json
   {
     "rules": {
       "reservas": { ".read": true, ".write": true },
       "avisos":   { ".read": true, ".write": true }
     }
   }
   ```
   El nodo `avisos` guarda los navegadores que aceptaron recibir avisos.

> Nota de seguridad: esto es adecuado para uso interno. La contraseña de administrador se verifica en el navegador, así que una persona con conocimientos técnicos podría modificar datos directamente en la base. Para mayor seguridad se puede agregar más adelante el inicio de sesión de Firebase (Firebase Authentication).

## 🔔 Avisos al navegador

### Cómo funciona

1. **Solicitante**: al entrar ve la invitación «Reciba avisos en este navegador» → **Activar avisos** → el navegador pide permiso → **Permitir**. Desde ese momento, cada solicitud que haga queda unida a su navegador. (También puede activarlo después de enviar la solicitud o desde «Mis solicitudes».)
2. **Administrador**: en **Administración** → **Activar avisos en este navegador** → **Permitir**. Puede activarlo en varios computadores y celulares.
3. Cuando llega una solicitud nueva → aviso a todos los navegadores de administración.
4. Cuando el administrador aprueba, rechaza o cancela → aviso al navegador del solicitante, con el motivo si lo hay.
5. Recordatorio al solicitante `RECORDATORIO_MIN` minutos antes de la reunión (en `js/config.js`; `0` lo desactiva).

Al tocar un aviso se abre la sección correspondiente. El botón de la campana 🔔 (arriba) muestra el estado y permite enviar un aviso de prueba o desactivarlos.

**Tiempos de entrega**
- Con la página abierta (aunque esté minimizada o en otra pestaña): al instante.
- Con la página o el navegador cerrados: los envía GitHub Actions cada 5 minutos; GitHub puede tardar algo más en horas de mucha demanda. El computador debe estar encendido; si estaba apagado, el aviso llega al encenderlo (hasta 24 h después).

**Navegadores**: Chrome, Edge, Firefox y Opera en computador y Android. En **iPhone/iPad** (iOS 16.4 o superior) primero hay que agregar la página a la pantalla de inicio (Compartir → «Agregar a inicio») y activar los avisos desde ese ícono. No funcionan en ventanas privadas o de incógnito.

### Configuración (una sola vez)

1. **Reglas de Firebase**: agregue el nodo `avisos` (ver las reglas de arriba).
2. **Secreto en GitHub**: en el repositorio → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `VAPID_PRIVATE_KEY`
   - Secret: la llave privada (archivo `.vapid-privada.txt` del equipo donde se generó; **nunca** se sube al repositorio).
3. En la pestaña **Actions** del repositorio, si GitHub lo pide, habilite los workflows. Puede ejecutar «Avisos push» a mano con **Run workflow** para probar.

### Cambiar las llaves VAPID

Si la llave privada se pierde o se expone, genere un par nuevo (por ejemplo con `npx web-push generate-vapid-keys`), ponga la pública en `VAPID_PUBLIC_KEY` de `js/config.js` y la privada en el secreto `VAPID_PRIVATE_KEY`. Cada persona deberá volver a activar los avisos.

## Publicar en GitHub Pages

1. Cree un repositorio en <https://github.com/new> (ej: `sala-juntas`), público.
2. Suba todos los archivos de esta carpeta (botón **Add file → Upload files**), conservando las carpetas `css` y `js`.
3. Vaya a **Settings → Pages** → en *Branch* elija `main` y carpeta `/ (root)` → **Save**.
4. En 1–2 minutos su página estará en: `https://SU-USUARIO.github.io/sala-juntas/`

Enlaces directos útiles:
- Registrar: `.../sala-juntas/#registrar`
- Cronograma: `.../sala-juntas/#cronograma`
- Administración: `.../sala-juntas/#admin`
