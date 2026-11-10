# HU-A04 — Consulta de Oferta Pública de Cursos

Este documento define la información pública, reglas de negocio y preguntas abiertas para la visualización del catálogo de cursos disponibles de Ciudad Pastel.

---

## 1. Tabla de Campos y Exposición Pública

A continuación se detalla qué campos del modelo de cursos se exponen a personas interesadas y cuáles permanecen exclusivamente para gestión administrativa:

| Campo | Público | Motivo | Estado |
|---|:---:|---|---|
| `id` | **Sí** | Identificador único necesario para consultar el detalle público (`/api/courses/:id`) y enlazar solicitudes de matrícula. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `name` | **Sí** | Nombre oficial del curso, visible en tarjetas de catálogo y título de detalle. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `summary` | **Sí** | Resumen conciso para las tarjetas y vistas previas del catálogo. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `description` | **Sí** | Descripción amplia del contenido pedagógico y técnicas impartidas. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `imageUrl` | **Sí** | Fotografía o imagen promocional del curso. Si no tiene, se maneja como `null`. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `learningOutcomes` | **Sí** | Lista de aprendizajes esperados y habilidades que adquirirá el estudiante. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `requiredMaterials` | **Sí** | Lista de materiales o utensilios que el estudiante debe llevar o preparar. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `capacity` | **Sí** | Cupo máximo planificado para el taller o curso (informativo; en esta etapa no hay conteo dinámico de cupos restantes). | PROPUESTA — falta confirmar con Ciudad Pastel |
| `price` | **Sí** | Costo del curso en colones costarricenses (entero; `0` indica curso gratuito). | PROPUESTA — falta confirmar con Ciudad Pastel |
| `instructor` | **Sí** | Nombre de la instructora o chef a cargo de la clase. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `schedule` | **Sí** | Fechas y horarios de impartición (`startDate`, `endDate`, `startTime`, `endTime`, `frequency`, `weekday`, `scheduleNote`). | PROPUESTA — falta confirmar con Ciudad Pastel |
| `status` | **No** | Estado administrativo del curso (`draft`, `published`, `archived`). La API pública filtra estrictamente y solo entrega cursos con estado `published`. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `createdAt` | **No** | Fecha interna de creación del registro. No aporta valor a los visitantes. | PROPUESTA — falta confirmar con Ciudad Pastel |
| `updatedAt` | **No** | Fecha interna de última modificación del registro. Exclusivo de auditoría. | PROPUESTA — falta confirmar con Ciudad Pastel |

---

## 2. Decisiones de Diseño y Reglas Técnicas

1. **Filtro estricto de visibilidad:**
   - El catálogo general, el de temporada y las opciones de filtrado solo consideran cursos `published` que siguen disponibles según la regla de calendario indicada en la sección de CIU-245.
   - Los parámetros ajenos a los filtros, como `?status=draft` o `?status=archived`, se siguen ignorando.
2. **Criterio de ordenamiento:**
   - Los cursos se ordenan por fecha de inicio (`schedule.startDate`) de forma ascendente (los más próximos a iniciar primero).
   - En caso de empate en la fecha de inicio, se desempata alfabéticamente por nombre (`name`) y después por identificador (`id`).
   - Aquellos cursos antiguos que no cuenten con fecha de planificación (`schedule == null` o `schedule.startDate == null`) se posicionan al final del catálogo.
   - El ordenamiento se realiza en memoria en la capa de servicios para evitar la necesidad de índices compuestos en Firestore.
3. **Detalle homogéneo y prevención de enumeración:**
   - Al consultar el detalle de un curso (`GET /api/courses/:id`):
     - Si está publicado: se retorna el curso con status 200.
     - Si el curso está en borrador (`draft`), archivado (`archived`) o no existe: se retorna exactamente el mismo código 404 con el cuerpo `{ "message": "Course not found." }`. Esto previene que usuarios externos averigüen la existencia de cursos no disponibles o en preparación.
4. **Seguridad y rendimiento:**
   - El catálogo general, el de temporada, el detalle y las opciones de filtrado son públicos y no requieren token.
   - No se aplican cabeceras de caché pública (`Cache-Control`) para garantizar que la oferta y cupos reflejen de inmediato los cambios realizados por la administración.

---

## 3. Preguntas para la Clienta (Yamilena Blanco Chaves)

1. **Visibilidad comercial:** ¿Desean mostrar el precio exacto en colones y el nombre de la instructora a cualquier persona que visite la web, o prefieren que esa información se consulte por WhatsApp?
2. **Cupo máximo:** ¿Es conveniente mostrar el cupo máximo del taller (por ejemplo, "Cupo: 10 personas") en la página pública?
3. **Cursos pasados:** Cuando un curso ya se impartió (la fecha de fin ya pasó), ¿prefieren que el sistema lo oculte automáticamente de la web, o que ustedes lo archiven manualmente desde el panel de administración cuando lo consideren conveniente?
4. **Orden de presentación:** ¿En qué orden prefieren que se muestren los cursos en el catálogo principal: por los que inician más pronto (fecha de inicio) o en orden alfabético por nombre?

---

## 4. Respuestas de Ciudad Pastel

> *Espacio reservado para documentar las respuestas formales de la clienta tras la sesión de validación:*
> - *(Pendiente de confirmación con la clienta)*

---

## 5. Decisiones técnicas provisionales pendientes de confirmación — CIU-245

### Listado público con filtros

`GET /api/courses` conserva el arreglo de objetos `PublicCourse`, incluido `remainingSpots`. Los filtros se aplican en conjunto con lógica AND. Si ningún curso coincide, responde HTTP 200 con `[]`.

| Parámetro | Regla provisional |
|---|---|
| `q` | Hasta 100 caracteres según el límite compartido con productos. La búsqueda exige que cada término normalizado aparezca en alguna parte del nombre, resumen o descripción pública. Ignora mayúsculas, tildes y puntuación. Debe contener al menos una letra o un dígito después de normalizar. |
| `instructor` | Coincidencia exacta después de ignorar mayúsculas y tildes, recortar los extremos y reducir secuencias de espacios a un solo espacio. Conserva la puntuación. Hasta 120 caracteres tras recortar los extremos. |
| `minPrice`, `maxPrice` | Límites inclusivos en colones. Solo se aceptan dígitos decimales para enteros de 0 a 9007199254740991. Los cursos gratuitos tienen precio 0. Un curso con precio ausente o inválido queda fuera si se aplica cualquiera de estos límites. |
| `from`, `to` | Límites inclusivos sobre `schedule.startDate` en fechas calendario válidas `YYYY-MM-DD`. Un curso con fecha de inicio ausente o inválida queda fuera si se aplica cualquiera de estos límites. La interpretación del intervalo queda pendiente de confirmación con Ciudad Pastel. |

Ejemplo de consulta combinada

```http
GET /api/courses?q=galletas&instructor=Yamilena%20Blanco%20Chaves&minPrice=0&maxPrice=45000&from=2026-11-20&to=2026-12-15
```

Un filtro vacío, repetido, enviado con notación de arreglo u objeto, fuera de formato o con un rango invertido devuelve HTTP 400. Este es el cuerpo para `?minPrice=45000&maxPrice=0`.

```json
{
  "message": "Course filter validation failed.",
  "errors": ["minPrice must not exceed maxPrice."]
}
```

### Opciones para los controles del catálogo

`GET /api/courses/filter-options` usa los mismos cursos que el listado general sin filtros. Agrupa instructores por su nombre normalizado y descarta los nombres vacíos. Para cada grupo conserva de forma determinista la menor etiqueta original recortada según el orden de cadenas de JavaScript. Las etiquetas resultantes se ordenan alfabéticamente en español de Costa Rica. El rango incluye precios válidos y cursos gratuitos.

```json
{
  "instructors": ["Yamilena Blanco Chaves"],
  "priceRange": { "min": 0, "max": 45000 }
}
```

Si no hay instructores, `instructors` es `[]`. Si no hay precios válidos, `priceRange` es `{"min": null, "max": null}`.

### Orden, temporada y disponibilidad

- Ambos listados conservan el orden por fecha de inicio ascendente, con cursos sin fecha al final y desempates por nombre e identificador.
- El catálogo general y sus opciones incluyen cursos de temporada vigentes. `GET /api/courses/seasonal` sigue siendo el listado dedicado y usa la misma disponibilidad. Añadir un filtro por temporada requiere confirmación.
- La disponibilidad termina al comenzar el día siguiente a `schedule.endDate` en `America/Costa_Rica`. Se incluye todo el último día calendario. Si falta `endDate`, se usa `startDate`. Un curso publicado sin ninguna de estas fechas sigue visible sin filtros de fechas.
- Un curso finalizado queda fuera de ambos listados y de las opciones. Su enlace directo `GET /api/courses/:id` sigue respondiendo HTTP 200 mientras permanezca publicado. Queda pendiente decidir si el detalle también debe ocultarse.
