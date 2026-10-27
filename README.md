# Sala de Juntas — Sistema de reservas

Aplicación web para solicitar, aprobar y publicar las reuniones de la Sala de Juntas.

## Funciones

- **Registrar reunión**: tema, departamento, descripción, fecha, horario y datos de la persona a cargo (C.C., nombre completo, teléfono, correo).
- **Disponibilidad en vivo**: al elegir una fecha se muestran los horarios ocupados. Si el horario elegido se cruza con una reunión aprobada, el sistema muestra **"Horario ocupado"** y no permite enviar la solicitud.
- **Ver cronograma**: vista semanal (tipo calendario) y vista de lista. Solo muestra las reuniones **aprobadas**.
- **Mis solicitudes**: cada solicitante consulta el estado de su solicitud con su cédula.
- **Administración** (con contraseña): aprobar, rechazar con motivo, cancelar o eliminar reuniones. El sistema no deja aprobar dos reuniones que se crucen.

## Estructura

```
index.html        Página principal
css/styles.css    Diseño
js/config.js      ⚙️ Configuración (horario, contraseña, base de datos)
js/storage.js     Guardado de datos (navegador o Firebase)
js/app.js         Lógica de la aplicación
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
       "reservas": { ".read": true, ".write": true }
     }
   }
   ```

> Nota de seguridad: esto es adecuado para uso interno. La contraseña de administrador se verifica en el navegador, así que una persona con conocimientos técnicos podría modificar datos directamente en la base. Para mayor seguridad se puede agregar más adelante el inicio de sesión de Firebase (Firebase Authentication).

## Publicar en GitHub Pages

1. Cree un repositorio en <https://github.com/new> (ej: `sala-juntas`), público.
2. Suba todos los archivos de esta carpeta (botón **Add file → Upload files**), conservando las carpetas `css` y `js`.
3. Vaya a **Settings → Pages** → en *Branch* elija `main` y carpeta `/ (root)` → **Save**.
4. En 1–2 minutos su página estará en: `https://SU-USUARIO.github.io/sala-juntas/`

Enlaces directos útiles:
- Registrar: `.../sala-juntas/#registrar`
- Cronograma: `.../sala-juntas/#cronograma`
- Administración: `.../sala-juntas/#admin`
