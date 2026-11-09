# HU-A08 — Publicar Cursos u Ofertas de Temporada (Seasonal Courses and Offers)

Este documento define las reglas de negocio, decisiones de diseño técnico, modelo de datos y preguntas abiertas para la gestión y publicación de cursos y ofertas de temporada en la Academia Ciudad Pastel.

---

## 1. Tabla de Decisiones y Reglas de Cursos u Ofertas de Temporada

| # | Decisión / Regla | Detalle Técnico y Operativo | Estado |
|---|---|---|---|
| 1 | **Identificación mediante `seasonName`** | Una oferta de temporada es un curso regular con una marca de temporada mediante el atributo `seasonName` (ejemplo: "Especial Navidad 2026", "San Valentín"). No se crea una entidad separada "oferta". Si Ciudad Pastel requiere promociones con descuento en precios o cupones, eso corresponde a otra historia de usuario independiente. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 2 | **Longitud y normalización de `seasonName`** | Campo de texto opcional de 2 a 60 caracteres tras aplicar `.trim()`. Si se envía vacío, solo con espacios en blanco o se omite, se normaliza y almacena como `null`. Un curso se considera de temporada si y solo si `seasonName !== null`. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 3 | **Criterio de disponibilidad pública de temporada** | Cualquier curso, en cualquier estado (borrador, publicado, archivado), puede marcarse administrativamente con `seasonName`. No obstante, la visibilidad pública sigue estrictamente la regla central de disponibilidad (`isCoursePubliclyAvailable`: curso publicado y no terminado en el calendario). Cuando un curso de temporada finaliza, desaparece automáticamente del catálogo público de temporada sin intervención manual. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 4 | **Administración en endpoints existentes** | Se marca o actualiza mediante los endpoints administrativos existentes (`POST /api/admin/courses` y `PUT /api/admin/courses/:id`). En el método `PUT`, la operación reemplaza el recurso completo; si `seasonName` se omite en el payload de un `PUT`, se establece en `null` (el frontend debe reenviar el valor existente si desea conservarlo). | PROPUESTA — falta confirmar con Ciudad Pastel |
| 5 | **Retiro de la publicación de temporada** | Se provee el endpoint administrativo `DELETE /api/admin/courses/:id/seasonal`, el cual remueve la marca de temporada estableciendo `seasonName` en `null` y actualizando `updatedAt`, respondiendo `204 No Content`. El curso conserva intactos todos sus demás campos, inscripciones y estado sin afectar a ningún otro curso. La operación es idempotente (si no era de temporada, responde igualmente `204`). Si el curso no existe en la base de datos, responde `404 Not Found`. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 6 | **Catálogo público de temporada (`GET /api/courses/seasonal`)** | La representación pública `PublicCourse` incluye el campo `seasonName` (`null` si no es de temporada). El endpoint público `GET /api/courses/seasonal` retorna únicamente los cursos que cumplen `isCoursePubliclyAvailable` y tienen `seasonName !== null`, aplicando el mismo orden del catálogo general (fecha de inicio ascendente, luego nombre ascendente, y cursos antiguos sin horario al final). Esta ruta se registra antes de `GET /api/courses/:id` para evitar colisiones de enrutamiento. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 7 | **Autorización administrativa estricta** | Todas las operaciones de modificación de cursos de temporada (`POST`, `PUT`, `DELETE /:id/seasonal`) requieren autenticación y rol de administrador (`authenticateUser, requireAdmin`). Los endpoints públicos de consulta (`GET /api/courses` y `GET /api/courses/seasonal`) son de libre acceso sin token y no invocan verificación de credenciales. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 8 | **Convención uniforme de errores** | Los errores de validación de formato responden `400` (`ValidationError`), los recursos inexistentes responden `404` (`NotFoundError`), y los fallos de infraestructura responden `500` con `{ message }` sin exponer detalles internos ni trazas de ejecución. | PROPUESTA — falta confirmar con Ciudad Pastel |

---

## 2. Preguntas para la Clienta (Ciudad Pastel)

Estas preguntas deben formularse a la clienta en lenguaje sencillo para validar y ajustar las reglas de negocio antes del lanzamiento:

1. **Definición de temporadas:** ¿Cuáles festividades o temporadas consideran clave para ofrecer cursos especiales (por ejemplo: Navidad, Día de la Madre, San Valentín, Halloween, Pascua)?
2. **Información requerida en la publicación:** ¿Qué datos consideran indispensables al publicar una actividad de temporada? ¿Es suficiente con el nombre de la temporada (ej. "Navidad 2026") y los detalles habituales del curso, o necesitan un campo para texto o lema destacado adicional?
3. **Vigencia y retiro automático:** ¿Les parece adecuado que el curso de temporada deje de mostrarse automáticamente a los clientes en la página tan pronto como termine la fecha de impartición del curso?
4. **Claridad sobre "ofertas":** Para ustedes en Ciudad Pastel, ¿una "oferta de temporada" se refiere a un curso temático especial (como técnicas de repostería navideña) o están pensando en descuentos sobre el precio habitual de un curso?
5. **Cantidad simultánea de temporadas:** ¿Cuántos cursos o temporadas esperan tener activos simultáneamente en la plataforma en un momento dado?

---

## 3. Respuestas de Ciudad Pastel

*(Sección vacía — pendiente de registrar las respuestas obtenidas por el equipo tras conversar con la clienta).*

---

## 4. Modelo de Datos de Cursos de Temporada (Seasonal Course Data Model)

En el modelo de curso (`apps/api/src/models/course.model.js`), el validador (`apps/api/src/validators/course.validator.js`) y el mapeo del repositorio (`apps/api/src/repositories/course.repository.js`), se incorpora el siguiente atributo:

- **`seasonName`**: Cadena de texto opcional (o `null`).
  - **Límites de longitud:** Entre 2 y 60 caracteres tras eliminar espacios en blanco en los extremos (`.trim()`).
  - **Normalización:** Valores nulos, indefinidos, vacíos (`""`) o de solo espacios se normalizan a `null`.
  - **Semántica:** Un curso se clasifica como de temporada si y solo si `seasonName !== null`.

### Compatibilidad y Estrategia sin Migraciones
- **Sin migraciones de base de datos:** Los documentos existentes en la colección `courses` de Firestore no poseen el campo `seasonName`. El mapper del repositorio (`mapCourseDocument`) asigna automáticamente el valor por defecto:
  ```javascript
  seasonName: courseData.seasonName ?? null
  ```
- Al leer cursos existentes, todos retornan `seasonName: null` de forma segura y consistente, garantizando compatibilidad retrospectiva inmediata sin requerir escrituras masivas en Firestore.
