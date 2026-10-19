# HU-A05 — Solicitudes de Matrícula (Enrollment Requests)

Una persona interesada (sin cuenta) solicita matricularse en un curso **publicado**.
La solicitud **no** crea una matrícula confirmada: Ciudad Pastel contacta a la persona,
el pago se coordina fuera de la plataforma (SINPE u otro medio) y la matrícula
confirmada se registra después en HU-A09.

## 1. Datos definidos con Ciudad Pastel

La clienta solo necesita **nombre completo, cédula y teléfono**: el nombre y la cédula
para los certificados, y el teléfono para contactar a la persona y agregarla al grupo
de WhatsApp del curso. No se pide correo ni mensaje (las dudas se atienden por
WhatsApp, 6378-5912).

| Campo | Origen | Regla |
|---|:---:|---|
| `id` | Servidor | UUID (`randomUUID()`), clave del documento. |
| `courseId` | URL | Curso de `POST /api/courses/:id/enrollment-requests`. Debe existir y estar `published`; si no, 404. |
| `courseName` | Servidor | Copia del nombre del curso al enviar (se conserva aunque el curso cambie). |
| `fullName` | Cliente | 3–120 caracteres; se quitan espacios repetidos. Obligatorio. |
| `idType` | Cliente | `national` (cédula nacional) o `dimex` (residentes). Obligatorio. |
| `idNumber` | Cliente | Solo dígitos (se quitan espacios y guiones). Cédula nacional: 9 dígitos y el primero es la provincia, de 1 a 7. DIMEX: 11 o 12 dígitos. Obligatorio. |
| `phone` | Cliente | Exactamente 8 dígitos (se quitan espacios y guiones). Obligatorio. |
| `status` | Servidor | `pending` al crear. Luego `contacted` o `discarded` (cualquier cambio entre los tres). |
| `createdAt` / `updatedAt` | Servidor | Timestamps de Firestore, devueltos en ISO 8601. |

Colección de Firestore: `enrollmentRequests/{id}`. Sin índices compuestos: se filtra
por un campo y el segundo filtro y el orden se aplican en memoria.

## 2. Reglas

1. **Campos protegidos:** `id`, `courseId`, `courseName`, `status` y las fechas los pone
   el servidor. Si el visitante los envía, se ignoran.
2. **Solicitudes repetidas:** una misma cédula solo puede tener una solicitud activa
   (`pending` o `contacted`) por curso → 409 *"already received"*. Si la anterior fue
   `discarded`, sí puede volver a solicitar.
3. **Sin bloqueo por cupo:** enviar una solicitud no reserva cupo.
4. **Antispam:** máximo 5 solicitudes cada 15 minutos por IP → 429 con `Retry-After`.
   El contador vive en memoria (se reinicia con el servidor). En producción detrás de
   un proxy, activar `app.set("trust proxy", 1)`.
5. **Respuesta pública mínima:** el 201 devuelve `id`, `courseId`, `courseName`,
   `status`, `createdAt` y un mensaje; no devuelve la cédula ni el teléfono.
6. **Privacidad:** las rutas `/api/admin/enrollment-requests` exigen administrador
   (HU-G01). Las reglas de Firestore deben negar el acceso directo de clientes a
   `enrollmentRequests` (`allow read, write: if false;`); la API usa Firebase Admin SDK.

## 3. Endpoints

| Método y ruta | Acceso | Respuestas |
|---|---|---|
| `POST /api/courses/:id/enrollment-requests` | Público | 201, 400, 404, 409, 429 |
| `GET /api/admin/enrollment-requests?courseId=&status=` | Admin | 200, 400, 401, 403 |
| `GET /api/admin/enrollment-requests/:id` | Admin | 200, 401, 403, 404 |
| `PATCH /api/admin/enrollment-requests/:id/status` | Admin | 200, 400, 401, 403, 404 |
