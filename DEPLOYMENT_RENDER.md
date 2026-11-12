# Guía de Despliegue en Render y Firebase - Ciudad Pastel

Esta guía detalla el paso a paso exacto para desplegar la plataforma **Ciudad Pastel** (API Backend y Frontend Web) en **Render** utilizando el plan 100% gratuito (sin requerir tarjeta de crédito) e integrarlo con **Firebase**.

---

## 📋 Resumen de Servicios

El repositorio es un monorepo gestionado con npm workspaces (`apps/api` y `apps/web`):

| Componente | Tipo en Render | Directorio Raíz | Build Command | Start / Publish |
|---|---|---|---|---|
| **API Backend** | Web Service | *(Vacío / Root)* | `npm install --workspace=apps/api` | `npm start --workspace=apps/api` |
| **Frontend Web** | Static Site | *(Vacío / Root)* | `npm install --workspace=apps/web && npm run build --workspace=apps/web` | `apps/web/dist` |

---

## 🚀 Paso 1: Desplegar el API Backend (Web Service)

1. Inicia sesión en [Render.com](https://dashboard.render.com/) con tu cuenta de GitHub.
2. Haz clic en **New +** → **Web Service**.
3. Selecciona el repositorio de GitHub: `ciudad-pastel`.
4. Configura los campos básicos:
   - **Name:** `ciudad-pastel-api` (o el nombre que prefieras).
   - **Region:** `Oregon (US West)` u `Ohio (US East)`.
   - **Root Directory:** *(Dejar vacío)*.
   - **Runtime:** `Node`.
   - **Build Command:**
     ```bash
     npm install --workspace=apps/api
     ```
   - **Start Command:**
     ```bash
     npm start --workspace=apps/api
     ```
   - **Instance Type:** `Free`.

5. **Credenciales y Variables de Entorno (Environment Variables):**
   Agrega las siguientes variables:
   - `NODE_VERSION`: `20`
   - `GOOGLE_CLOUD_PROJECT`: *(ID de tu proyecto de Firebase, por ejemplo: `ciudad-pastel-prod`)*.
   - `FRONTEND_URL`: `https://ciudad-pastel-web.onrender.com,http://localhost:5173` *(luego del paso 2 ajustas la URL final del frontend)*.

6. **Configuración de la Llave de Servicio de Firebase:**
   Tienes dos formas admitidas por el código:
   - **Opción A (Recomendada - Secret Files):**
     1. En la pestaña **Secret Files** de Render, haz clic en **Add Secret File**.
     2. **Filename:** `firebase-service-account.json`.
     3. Pega el contenido completo del archivo JSON de la clave de Firebase.
     4. En las variables de entorno, agrega:
        - `GOOGLE_APPLICATION_CREDENTIALS`: `/etc/secrets/firebase-service-account.json`
   - **Opción B (Variable directa de entorno):**
     1. En la sección **Environment Variables**, agrega la variable `FIREBASE_SERVICE_ACCOUNT`.
     2. Pega todo el JSON de la cuenta de servicio como valor. El código lo detecta y analiza automáticamente.

7. Haz clic en **Deploy Web Service**.
8. Una vez desplegado, copia la URL asignada (ejemplo: `https://ciudad-pastel-api.onrender.com`). Verifica que responda abriendo `https://ciudad-pastel-api.onrender.com/api/docs`.

---

## 🌐 Paso 2: Desplegar el Sitio Web (Static Site)

1. En el panel de Render, haz clic en **New +** → **Static Site**.
2. Selecciona el mismo repositorio `ciudad-pastel`.
3. Configura los campos:
   - **Name:** `ciudad-pastel-web`.
   - **Root Directory:** *(Dejar vacío)*.
   - **Build Command:**
     ```bash
     npm install --workspace=apps/web && npm run build --workspace=apps/web
     ```
   - **Publish Directory:**
     ```text
     apps/web/dist
     ```

4. **Variables de Entorno (Environment Variables):**
   - `VITE_USE_MOCKS`: `false`
   - `VITE_API_URL`: `https://ciudad-pastel-api.onrender.com/api` *(la URL de tu Web Service + `/api`)*.
   - `VITE_FIREBASE_API_KEY`: *(tu API Key de Firebase)*
   - `VITE_FIREBASE_AUTH_DOMAIN`: `tu-proyecto.firebaseapp.com`
   - `VITE_FIREBASE_PROJECT_ID`: `tu-proyecto`
   - `VITE_FIREBASE_STORAGE_BUCKET`: `tu-proyecto.firebasestorage.app`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`: `...`
   - `VITE_FIREBASE_APP_ID`: `...`

5. **Regla de Reescritura SPA (CRÍTICO para React Router):**
   En la pestaña **Redirects / Rewrites** de Render:
   - **Type:** `Rewrite`
   - **Source:** `/*`
   - **Destination:** `/index.html`
   *(Sin esta regla, al recargar páginas como `/cursos`, `/login` o `/admin` el navegador dará un error 404 de Render).*

6. Haz clic en **Create Static Site**.
7. Copia la URL del sitio web generado (ejemplo: `https://ciudad-pastel-web.onrender.com`).

---

## 🔗 Paso 3: Ajustes de Conectividad (CORS y Firebase Auth)

1. **Actualizar CORS en el API:**
   - Vuelve a tu servicio `ciudad-pastel-api` en Render → **Environment**.
   - Asegúrate de que `FRONTEND_URL` contenga la URL exacta del sitio web desplegado (sin barra al final):
     ```env
     FRONTEND_URL=https://ciudad-pastel-web.onrender.com,http://localhost:5173
     ```
   - Guarda los cambios (Render reiniciará la API automáticamente).

2. **Autorizar el Dominio en Firebase Authentication:**
   - Ve a la [Consola de Firebase](https://console.firebase.google.com/) → Tu proyecto.
   - Navega a **Build** → **Authentication** → pestaña **Settings** (Configuración) → **Authorized domains** (Dominios autorizados).
   - Haz clic en **Add domain** y escribe el dominio de Render (ejemplo: `ciudad-pastel-web.onrender.com`).
   - *Nota:* Sin este paso, Firebase rechazará el inicio de sesión con Google o correo por protección de origen.

---

## 🔒 Paso 4: Reglas de Seguridad de Firestore

Dado que todo el acceso a la base de datos se realiza a través de la API Backend protegida (`apps/api` con `firebase-admin`, que opera con privilegios de administrador de backend), los clientes web no deben tener acceso directo a las colecciones de Firestore.

En la Consola de Firebase → **Firestore Database** → pestaña **Rules**:
Pega y publica las reglas de [`firestore.rules`](./firestore.rules):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Todo el acceso se canaliza a través de apps/api (Node.js con Firebase Admin SDK).
    // Se bloquea el acceso directo desde el cliente web por seguridad.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 👥 Paso 5: Asignación de Roles de Administrador

Para que Yamilena y María del Socorro puedan acceder al panel de administración (`/admin`):

1. Asegúrate de que ambas usuarias se hayan registrado al menos una vez en la aplicación con su correo electrónico (mediante login con Google o registro tradicional).
2. Abre una terminal local en la raíz del proyecto y ejecuta el script para cada una:
   ```bash
   node apps/api/scripts/set-admin.js correo_yamilena@gmail.com
   node apps/api/scripts/set-admin.js correo_socorro@gmail.com
   ```
3. La consola confirmará: `Admin role assigned successfully to <email>`.
4. Las usuarias deberán cerrar sesión y volver a iniciarla en el sitio web para que su token refleje el claim `admin: true`.

---

## ⏰ Paso 6: Mitigación del Modo Suspensión (Plan Free de Render)

En el plan gratuito de Render, los Web Services se suspenden ("spin down") tras **15 minutos de inactividad**. Cuando entra una nueva solicitud, tarda entre **45 y 60 segundos** en despertar.

### Recomendaciones para la demostración con la clienta:
1. **Calentamiento manual:** Abre la página del sitio web o llama a `https://ciudad-pastel-api.onrender.com/api/docs` unos 2 minutos antes de que la clienta ingrese para que el servicio ya esté caliente y responda de forma instantánea.
2. **Ping automático gratuito (Keep-Alive):**
   - Entra a [cron-job.org](https://cron-job.org/) o [UptimeRobot](https://uptimerobot.com/) (ambos gratuitos).
   - Crea un monitor HTTP GET hacia:
     `https://ciudad-pastel-api.onrender.com/api/public/categories`
   - Configura la frecuencia cada **10 minutos**.
   - Con esto el servicio se mantendrá activo durante el horario de demostración sin dormirse.

