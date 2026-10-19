# HU-A09 — Matrícula confirmada (Enrollments)

Una matrícula confirmada es distinta de la solicitud inicial (HU-A05). La registra
**solo una administradora**, después de coordinar el pago fuera de la plataforma
(SINPE u otro medio). Puede venir de una solicitud o registrarse a mano.

## 1. Datos

Colección de Firestore: `enrollments/{id}`.

| Campo | Regla |
|---|---|
| `id` | UUID del servidor. |
| `courseId` / `courseName` | Curso al que pertenece (el nombre se copia al registrar). |
| `fullName` | 3–120 caracteres. |
| `idType` | `national` (cédula, 9 dígitos, empieza con 1–7) o `dimex` (11 o 12 dígitos). |
| `idNumber` | Solo dígitos: se guardan sin guiones ni espacios. |
| `phone` | 8 dígitos, sin guiones ni espacios. |
| `enrollmentRequestId` | Solicitud original (HU-A05), o `null` si se registró a mano sin solicitud. |
| `status` | `enrolled` (activa) o `cancelled`. |
| `note` | Opcional, máx. 500 caracteres (ej. "Pagó por SINPE"). |
| `confirmedAt` / `cancelledAt` | Fecha de confirmación y de cancelación. |
| `createdAt` / `updatedAt` | Timestamps del servidor. |

## 2. Reglas

1. **Solo administradoras** pueden registrar, ver, corregir o cancelar matrículas
   (todas las rutas exigen sesión de administración: 401/403).
2. **Sin duplicados:** una cédula solo puede tener **una matrícula activa** por curso
   → 409 `ALREADY_ENROLLED`. Si la anterior se canceló, se puede volver a matricular.
3. **Cupo:** las matrículas activas no pueden superar `capacity` → 409 `COURSE_FULL`.
   Si el curso no tiene cupo definido, no hay límite.
4. **Cancelar libera el cupo.** Reactivar una matrícula cancelada necesita cupo libre.
5. **Cursos archivados** no aceptan matrículas → 409 `COURSE_ARCHIVED`. Los borradores
   sí, por si se matricula antes de publicar.
6. **Desde una solicitud:** al confirmar, la solicitud pasa a `confirmed` y guarda
   `enrollmentId`, para que no se procese dos veces → 409 `REQUEST_ALREADY_CONFIRMED`.
   Una solicitud descartada debe volver a pendiente antes de confirmarse
   (→ 409 `REQUEST_DISCARDED`). `confirmed` no se puede poner a mano en
   `PATCH .../status`, y una solicitud confirmada ya no cambia de estado.
7. **Registro manual:** si la persona tenía una solicitud pendiente o contactada para
   ese curso, también se marca como `confirmed`.
8. **Concurrencia:** cupo y duplicados se revisan dentro de una transacción de
   Firestore, así dos registros al mismo tiempo no pueden sobrepasar el cupo.
9. Una persona con solicitud confirmada no puede enviar otra solicitud pública
   para el mismo curso (409 de HU-A05).

## 3. Uso por otras historias

- **HU-A04:** `GET /api/courses` y `GET /api/courses/:id` incluyen `remainingSpots`
  (cupo − matrículas activas; `null` si no hay cupo). No exponen datos de estudiantes.
- **HU-A06:** `findActiveEnrollments({ idNumber, phone, courseId? })` e
  `isStudentEnrolled(courseId, idNumber, phone)` en
  `src/services/enrollment.service.js` buscan matrículas **activas** con la cédula **y**
  el teléfono; las canceladas no cuentan.

## 4. Endpoints

| Método y ruta | Respuestas |
|---|---|
| `POST /api/admin/courses/:courseId/enrollments` | 201, 400, 401, 403, 404, 409 |
| `GET /api/admin/courses/:courseId/enrollments?status=` | 200, 400, 401, 403, 404 |
| `POST /api/admin/enrollment-requests/:id/confirm` | 201, 400, 401, 403, 404, 409 |
| `PATCH /api/admin/enrollments/:id` | 200, 400, 401, 403, 404, 409 |
