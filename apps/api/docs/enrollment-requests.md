# HU-A05 — Solicitudes de Matrícula (Enrollment Requests)

Este documento define la estructura de datos, reglas de validación y preguntas abiertas para el registro y gestión de solicitudes de matrícula en Ciudad Pastel.

---

## 1. Tabla de Campos y Reglas de Negocio

| Campo | Origen | Tipo / Regla | Propósito | Estado |
|---|:---:|---|---|---|
| `id` | **Servidor** | String (UUID generado con `randomUUID()`). Clave del documento. | Identificador único de la solicitud. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `courseId` | **Cliente** | String (ID del curso). Obligatorio. | Enlace al curso solicitado. Debe existir y estar en estado `published`. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `courseName` | **Servidor** | String (3–120 caracteres). Copia del nombre del curso al enviar. | Permite a la administración identificar el curso incluso si este cambia de nombre o se archiva. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `fullName` | **Cliente** | String (3–120 caracteres tras `trim`). Obligatorio. | Nombre completo de la persona interesada. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `email` | **Cliente** | String formato email estándar (máx. 254 caracteres). Obligatorio. | Correo electrónico para contacto y posterior acceso de estudiante (HU-A06). | PROPUESTA — falta confirmar con Ciudad Pastel |
| `phone` | **Cliente** | String dígitos normalizados (8–15 dígitos). Obligatorio. | Teléfono / WhatsApp para coordinar pago SINPE y detalles. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `message` | **Cliente** | String opcional (máx. 500 caracteres tras `trim`) o `null`. | Preguntas, dudas o información adicional del solicitante. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `status` | **Servidor** | String enum (`"pending"`, `"contacted"`, `"cancelled"`). Inicialmente `"pending"`. | Estado de atención de la solicitud por parte de Ciudad Pastel. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `createdAt` | **Servidor** | Timestamp / ISO 8601 string. | Fecha y hora exacta de recepción de la solicitud. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `updatedAt` | **Servidor** | Timestamp / ISO 8601 string. | Fecha y hora de última actualización administrativa. | PROPUESTA — falta confirmar con Ciudad Pastel |

---

## 2. Decisiones de Diseño y Reglas Técnicas

1. **Campos protegidos del servidor:**
   - `id`, `courseName`, `status`, `createdAt` y `updatedAt` son fijados exclusivamente por el servidor. Cualquier intento del cliente de enviarlos en el cuerpo de la petición es ignorado o descartado.
2. **Normalización telefónica:**
   - La persona puede ingresar espacios, guiones o paréntesis (ej. `8888-8888` o `+506 8888 8888`), pero el sistema extrae únicamente los dígitos para almacenar un número estándar de 8 a 15 cifras.
3. **Validación de curso publicado:**
   - Una solicitud solo puede ser procesada si el curso existe y se encuentra actualmente con `status === "published"`. Si el curso está en borrador, archivado o no existe, se rechaza con 404 (`Course not found.`).
4. **No bloqueante por cupos:**
   - Enviar una solicitud de matrícula **NO** reserva un cupo automáticamente ni matricula al alumno; el pago y confirmación formal se coordinan fuera de la plataforma (ej. SINPE Móvil). Por lo tanto, no se bloquean solicitudes por cupo lleno.
5. **Almacenamiento en Firestore:**
   - Colección: `enrollmentRequests/{id}`.
   - Sin migraciones ni índices compuestos (las consultas se filtran por campo simple y se ordenan en memoria).
6. **Seguridad y Privacidad (NOTA PARA EL HUMANO):**
   - La colección `enrollmentRequests` almacena datos personales sensibles (nombres, teléfonos, correos). Las reglas de seguridad de Firestore (`firestore.rules`) deben **negar todo acceso directo de clientes** (`allow read, write: if false;`). La API accede exclusivamente mediante Firebase Admin SDK.

---

## 3. Preguntas para la Clienta (Yamilena Blanco Chaves)

1. **Datos de contacto necesarios:** ¿Qué datos consideran indispensables para contactar a una persona interesada (nombre completo, teléfono/WhatsApp, correo electrónico)? ¿Es necesario algún dato adicional como lugar de residencia o cédula?
2. **Medio preferido de comunicación:** ¿Prefieren contactar a los interesados principalmente por WhatsApp, llamada telefónica o por correo electrónico?
3. **Preguntas adicionales en el formulario:** ¿Desean incluir campos opcionales como experiencia previa en repostería, edad del estudiante (o si es para un menor de edad), o si tienen alguna alergia alimentaria?
4. **Consentimiento y privacidad:** ¿Requieren mostrar una cláusula de consentimiento o aviso de privacidad sobre el tratamiento de datos personales antes de enviar el formulario?
5. **Notificación de nuevas solicitudes:** ¿Cómo prefieren enterarse de que llegó una nueva solicitud: revisando el listado en la plataforma administrativa, o desearían recibir una notificación automática por correo electrónico?

---

## 4. Respuestas de Ciudad Pastel

> *Espacio reservado para registrar formalmente las respuestas de la clienta tras la validación:*
> - *(Pendiente de confirmación con la clienta)*
