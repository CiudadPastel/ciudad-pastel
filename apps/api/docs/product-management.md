# HU-T06 — Administración de Productos del Catálogo (Product Management)

Este documento define las reglas de negocio, decisiones de diseño, modelo administrativo y preguntas abiertas para la gestión y administración de productos del catálogo de Ciudad Pastel.

---

## 1. Tabla de Decisiones y Reglas de Administración

| # | Regla / Decisión | Detalle Técnico y Operativo | Estado |
|---|---|---|---|
| 1 | **Eliminación suave (Soft Delete)** | Quitar un producto establece su estado en `status: "withdrawn"`. Deja de exponerse en el catálogo público y sus datos históricos se conservan íntegros en Firestore. No se implementa acción de restaurar. Un producto retirado es de solo lectura (`PUT` responde `409 Conflict`). | PROPUESTA — falta confirmar con Ciudad Pastel |
| 2 | **Campos permitidos al crear y modificar** | `name` (obligatorio, 3–120 caracteres tras `trim`), `description` (opcional, máx. 1000 caracteres tras `trim`, almacena `null` si falta), `price` (obligatorio, entero en colones CRC entre 1 y 10 000 000), `categoryId` (obligatorio, debe referenciar una categoría existente), `imageUrl` (opcional, URL con protocolo `http` o `https` de máx. 500 caracteres, almacena `null` si falta) y `available` (booleano). | PROPUESTA — falta confirmar con Ciudad Pastel |
| 3 | **Comportamiento de disponibilidad (`available`)** | Si se omite al crear un producto, su valor por defecto es `true` (disponible). Al modificar un producto con `PUT`, si se omite `available`, se conserva el valor que ya tenía registrado. El validador devuelve `available: undefined` cuando se omite para permitir esta distinción en el servicio. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 4 | **Estado inicial publicado** | Todo nuevo producto registrado nace con `status: "published"`. El cliente nunca puede fijar ni alterar directamente los campos protegidos `id`, `status`, `createdAt` ni `updatedAt`. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 5 | **Autenticación y autorización estricta** | Todas las rutas administrativas (`/api/admin/products` y `/api/admin/categories`) exigen autenticación (`authenticateUser`) y rol de administrador (`requireAdmin`). Se rechaza cualquier solicitud no autorizada con 401 (sin sesión) o 403 (sin rol de admin). | PROPUESTA — falta confirmar con Ciudad Pastel |
| 6 | **Gestión de imágenes mediante URL externa** | En esta fase se admite una única URL externa por producto. La carga directa de archivos fotográficos a Cloud Storage queda pospuesta debido a los requerimientos de facturación del plan Blaze de Firebase. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 7 | **Categorías preexistentes de solo lectura** | Las categorías no se crean ni modifican en este módulo; se asume que ya existen. El endpoint `GET /api/admin/categories` se provee exclusivamente para alimentar el selector de categorías del formulario en la interfaz administrativa. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 8 | **Convención uniforme de respuestas y errores** | Respuestas exitosas devuelven 200/201 con la entidad `AdminProduct` o 204 sin contenido al quitar. Errores de validación responden 400 (`{ message, errors: [...] }`), recursos no encontrados responden 404 (`NotFoundError`), conflictos con productos retirados responden 409 (`ConflictError`), y fallos de infraestructura responden 500 sin fugar detalles internos. | PROPUESTA — falta confirmar con Ciudad Pastel |

---

## 2. Reglas de Validación de Datos (`PRODUCT_LIMITS`)

Las reglas se aplican rigurosamente tanto en creación (`POST /api/admin/products`) como en actualización (`PUT /api/admin/products/:id`):

- **`name`:** Texto obligatorio. Mínimo 3 caracteres, máximo 120 caracteres tras aplicar `trim()`.
- **`description`:** Texto opcional. Máximo 1000 caracteres tras aplicar `trim()`. Si se omite, es vacío o es `null`, se normaliza a `null`.
- **`price`:** Número entero positivo obligatorio en colones costarricenses (CRC). Rango exacto: 1 a 10 000 000 inclusive. No se permiten decimales, números negativos ni strings.
- **`categoryId`:** Cadena obligatoria. No puede ser vacía y debe corresponder a un documento existente en la colección `categories`.
- **`imageUrl`:** Texto opcional. Máximo 500 caracteres tras aplicar `trim()`. Debe ser una URL sintácticamente válida con protocolo `http:` o `https:`. Si se omite o es `null`, se almacena como `null`. Esquemas no autorizados (`javascript:`, `ftp:`, `data:`) son rechazados por el validador y neutralizados por `sanitizeImageUrl`.
- **`available`:** Booleano opcional. Acepta estrictamente `true` o `false`. Si no es de tipo booleano (ej. string `"true"`, número `1`, o `null`), se rechaza con error 400. Si se omite (valor `undefined`), el validador retorna `undefined`, permitiendo que:
  - En **creación**, el servicio le asigne `true` por defecto.
  - En **actualización**, el servicio conserve el valor que el producto ya tenía.
- **Campos protegidos ignorados:** Cualquier intento del cliente de inyectar `id`, `status`, `createdAt` o `updatedAt` en el cuerpo de la petición es ignorado silenciosamente por el validador.

---

## 3. Regla de Eliminación Suave (Soft Delete)

1. **Operación de Retiro:** Al invocar `DELETE /api/admin/products/:id`, el backend no borra físicamente el documento de Firestore. En su lugar, actualiza atómicamente el campo `status` a `"withdrawn"` y renueva `updatedAt` con la marca de tiempo del servidor.
2. **Impacto en el Catálogo Público:** El catálogo público filtra exclusivamente `where("status", "==", "published")`. Por ende, el producto retirado desaparece inmediatamente de la vista de los clientes.
3. **Visibilidad Administrativa:** En las consultas administrativas (`GET /api/admin/products` y `GET /api/admin/products/:id`), los productos retirados siguen siendo plenamente visibles con su campo `status: "withdrawn"` para auditoría y consulta histórica.
4. **Inmutabilidad de Productos Retirados:** Un producto retirado no puede ser modificado. Cualquier petición `PUT /api/admin/products/:id` sobre un producto con `status: "withdrawn"` responderá con `409 Conflict` (`"Removed products cannot be updated."`).
5. **Idempotencia:** Ejecutar `DELETE` sobre un producto que ya se encuentra retirado responde exitosamente con `204 No Content` sin generar errores ni alterar datos adicionales.

---

## 4. Preguntas para la Clienta (Yamilena Blanco Chaves / María del Socorro)

1. **Datos requeridos del producto:** ¿Qué información consideran estrictamente indispensable registrar para que un producto pueda mostrarse en el catálogo digital?
2. **Control de disponibilidad:** ¿El indicador de disponibilidad es únicamente "Disponible / Agotado" o necesitan gestionar cantidades exactas de existencias en inventario?
3. **Concepto de "Quitar producto":** Al retirar un producto, ¿prefieren que simplemente deje de verse al público (pudiendo consultar el registro histórico en el panel administrativo), o desean que se elimine por completo y para siempre de la base de datos?
4. **Almacenamiento de fotografías:** ¿Cómo reciben o gestionan las fotos de los productos actualmente (enlaces de internet, Drive, mensajes de WhatsApp, archivos en la computadora)?
5. **Responsable de la administración diaria:** ¿Quién se encargará de ingresar y actualizar los productos del catálogo día a día en Ciudad Pastel (Yamilena, María del Socorro u otra persona autorizada)?

---

## 5. Respuestas de Ciudad Pastel

> *Espacio reservado para registrar formalmente las respuestas de la clienta tras la sesión de validación:*
> - *(Pendiente de confirmación con la clienta)*
