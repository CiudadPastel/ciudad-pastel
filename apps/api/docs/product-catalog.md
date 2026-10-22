# HU-T01 — Catálogo de Productos (Product Catalog)

Este documento define las reglas de negocio, estructura de datos y preguntas abiertas para la visualización del catálogo de productos e insumos de repostería de Ciudad Pastel.

---

## 1. Tabla de Reglas de Negocio del Catálogo

| # | Regla | Detalle | Estado |
|---|---|---|---|
| 1 | **Campos obligatorios del producto** | Cada producto cuenta con `name` (3–120 caracteres tras `trim`), `price` (entero en colones costarricenses, entre 1 y 10 000 000), una única `categoryId` y un indicador booleano `available` (disponibilidad). | PROPUESTA — falta confirmar con Ciudad Pastel |
| 2 | **Campos opcionales del producto** | `description` (texto opcional de máx. 1000 caracteres tras `trim`) e `imageUrl` (URL válida con protocolo `http` o `https`, máx. 500 caracteres). Si no se aportan, se normalizan a `null`. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 3 | **Disponibilidad sin inventario numérico** | En esta etapa no se gestionan existencias numéricas (stock). Solo se indica si el producto está disponible (`available: true`) o agotado (`available: false`). | PROPUESTA — falta confirmar con Ciudad Pastel |
| 4 | **Visibilidad de agotados** | Los productos agotados **sí** se muestran en el catálogo público para que los clientes conozcan la oferta completa, pero claramente señalizados como no disponibles para compra inmediata. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 5 | **Pertenencia única a categoría** | Cada producto pertenece a una sola categoría organizativa. Si no se encuentra su categoría, se presenta con `category: null` sin perderse. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 6 | **Estados del producto** | `status` interno: `"published"` (publicado) o `"withdrawn"` (retirado). La API pública filtra estrictamente y solo expone productos con `status === "published"`. El retiro se gestionará en HU-T06. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 7 | **Imágenes externas (fase 1)** | Una sola imagen por producto mediante URL externa (`http`/`https`). La carga directa de archivos de imagen a la plataforma queda supeditada a HU-T06 y al plan de almacenamiento de Firebase. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 8 | **Sin paginación** | Se asume un volumen de hasta ~300 productos en el catálogo activo, por lo que el endpoint devuelve la lista completa para facilitar navegación y filtrado rápido en el cliente. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 9 | **Criterio de ordenamiento** | Los productos se ordenan primero por el número de orden de su categoría (`category.order` ascendente; productos sin categoría van al final), y en segundo lugar alfabéticamente por nombre (`localeCompare` con localización `"es"`). | PROPUESTA — falta confirmar con Ciudad Pastel |
| 10 | **Precios fijos** | Todos los productos tienen un precio definido y exacto en colones. Si existen insumos sujetos a cotización ("precio a consultar"), requerirá confirmación de Ciudad Pastel. | PROPUESTA — falta confirmar con Ciudad Pastel |

---

## 2. Decisiones de Diseño y Arquitectura Técnica

1. **Almacenamiento en Firestore:**
   - **Colección `categories/{id}`:**
     ```json
     {
       "id": "seed-cat-1",
       "name": "Harinas y mezclas",
       "order": 1,
       "createdAt": "2026-10-21T00:00:00.000Z",
       "updatedAt": "2026-10-21T00:00:00.000Z"
     }
     ```
   - **Colección `products/{id}`:**
     ```json
     {
       "id": "seed-prod-01",
       "name": "Harina de trigo todo uso 1 kg",
       "description": "Harina de trigo de alta calidad para repostería y panadería.",
       "price": 1450,
       "categoryId": "seed-cat-1",
       "imageUrl": "https://placehold.co/600x400/png?text=Harina%20de%20trigo",
       "available": true,
       "status": "published",
       "createdAt": "2026-10-21T00:00:00.000Z",
       "updatedAt": "2026-10-21T00:00:00.000Z"
     }
     ```
   - **Sin migraciones ni índices compuestos:** Se crean colecciones nuevas en Firestore sin requerir migraciones de datos previas. La consulta pública utiliza únicamente `where("status", "==", "published")` (filtro simple sobre un único campo, sin requerir índice compuesto) y el ordenamiento multicriterio (orden de categoría + nombre alfabético con `es`) se realiza en memoria en la capa de servicios.
2. **Caché en memoria (Plan Spark):**
   - Para no agotar la cuota diaria gratuita de lecturas de Firestore (50 000 lecturas/día), el servicio cachea el catálogo público completo durante 60 segundos (`CATALOG_CACHE_TTL_MS = 60_000`).
   - Se expone `invalidateProductCatalogCache()` para que operaciones de escritura (HU-T06) invaliden la caché de forma inmediata.
   - Las respuestas de error (500) nunca se almacenan en caché y se devuelven copias profundas/desacopladas para evitar mutaciones de estado en memoria.
3. **Seguridad y Privacidad (NOTA PARA EL HUMANO):**
   - Configurar en las reglas de seguridad de Firestore (`firestore.rules`) que se **niegue todo acceso directo de clientes** a las colecciones `products` y `categories` (`allow read, write: if false;`), ya que toda consulta se realiza de forma segura mediante Firebase Admin SDK desde el backend.

---

## 3. Preguntas para la Clienta (Yamilena Blanco Chaves)

1. **Tamaño del catálogo:** ¿Cuántos productos o insumos manejan aproximadamente en la tienda física de Ciudad Pastel?
2. **Precios variables:** ¿Todos los productos tienen un precio fijo en colones, o existen insumos cuyo precio dependa del peso exacto o sea "a consultar"?
3. **Visibilidad de agotados:** Cuando un insumo se termina temporalmente, ¿prefieren que siga visible en la página con la etiqueta "Agotado", o que se oculte por completo hasta que vuelva a haber stock?
4. **Inventario numérico:** ¿Les basta con marcar "Disponible / Agotado" manualmente, o necesitan llevar control de unidades específicas en bodega?
5. **Categorías múltiples:** ¿Un producto siempre pertenece a una sola categoría (ej. Chocolates), o podría requerir aparecer en más de una (ej. Decoración y Chocolates)?
6. **Listado de categorías:** ¿Cuáles son las categorías principales en las que clasifican sus insumos de repostería?
7. **Fotografías de productos:** ¿Cuentan con fotos de los productos actualmente? ¿Dónde las tienen almacenadas (Google Drive, Instagram, fotografías de celular)?
8. **Variantes y presentaciones:** Cuando un insumo viene en varios tamaños o pesos (por ejemplo, Harina de 1 kg y Harina de 2 kg), ¿lo manejan como productos separados o como opciones de un mismo producto?

---

## 4. Respuestas de Ciudad Pastel

> *Espacio reservado para registrar formalmente las respuestas de la clienta tras la sesión de validación:*
> - *(Pendiente de confirmación con la clienta)*
