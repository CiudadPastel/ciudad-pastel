# Listados administrativos: búsqueda y navegación

## Diagnóstico y decisiones

La inspección se realizó en `main`. Los cambios locales anteriores en
`apps/web/index.html` y `apps/web/public/logo-ciudad-pastel-icon.png` se conservaron.

| Módulo / ruta web | Implementación y contrato reutilizados | Situación anterior |
| --- | --- | --- |
| Cursos, `/admin/cursos` | `CoursesList`, `courses.service`, `GET /api/admin/courses` | Estado y clasificación `courseType` en URL; orden por modificación en el servicio; sin búsqueda ni paginación. |
| Productos, `/admin/productos` | `ProductsList`, `products.service`, `GET /api/admin/products` | Estado en memoria; categorías incluidas en `AdminProduct`; orden por modificación en backend; sin búsqueda ni paginación. |
| Solicitudes, `/admin/solicitudes` | `EnrollmentRequests`, `enrollmentRequests.service`, `GET /api/admin/enrollment-requests` | Estado y curso en URL; más recientes primero; sin búsqueda, fechas ni paginación. |

Las rutas de API conservan `authenticateUser` y `requireAdmin`. Los controladores
delegan en `course.service`, `admin-product.service` y
`enrollment-request.service`, respectivamente. Los repositorios actuales leen
arrays completos: `getCourses` admite estado; `getAllProducts` lee productos y
el servicio agrega categorías; `getEnrollmentRequests` admite curso/estado,
consulta un campo en Firestore y aplica el filtro restante y orden en memoria.
Se revisaron OpenAPI, documentación de productos/solicitudes, pruebas de API y
patrones visuales existentes (`Notice`, `StateMessage`, `ResultsCount`, tokens CSS).

No se agregaron endpoints, dependencias, campos, índices ni consultas de Firestore.
Se reutilizan los arrays completos ya devueltos por los tres endpoints. La búsqueda
se aplica a todo el array **antes** de la paginación local de 20 registros. Nunca
busca solamente en los registros de la página visible.

## Comportamiento

- Búsqueda de palabras completas o parciales, sin distinguir mayúsculas ni tildes,
  con debounce de 300 ms y cancelación del temporizador anterior.
- Cursos: nombre, estado y tipo real (incluido sin tipo), nombre A–Z/Z–A,
  modificación reciente y creación en ambas direcciones. No existe categoría
  independiente: se usa `courseType` como clasificación.
- Productos: nombre, categoría incluida en respuesta (incluidos los productos sin
  categoría), estados `published`/`withdrawn`, disponibilidad `available`, nombre,
  precio y modificación. Mantiene acciones existentes y confirma retiros.
- Solicitudes: identificador, nombre, identificación, teléfono o curso ya visibles
  para administradores; estados `pending`, `contacted`, `confirmed`, `discarded`;
  curso y fechas inclusivas de recepción en `America/Costa_Rica`.
  Orden predeterminado: más recientes primero. Pendientes y contactadas se marcan
  como «Requiere atención». Solo existe el tipo matrícula: no se inventa un filtro
  por tipos adicionales.
- Contador de coincidencias y rango visible, limpieza de todos los controles,
  páginas anterior/siguiente y protección ante páginas inválidas o fuera de rango.
- Cambiar búsqueda, filtros u orden elimina la página anterior. La página se ajusta
  también si una acción deja menos resultados.
- Búsqueda, filtros, orden y página viven en URL. El estado `from` se transmite por
  detalle, edición, cancelación, guardado y enlaces de solicitudes a cursos.
  Solo se aceptan destinos de retorno que correspondan a los tres listados locales.
- Los controles usan etiquetas nativas, foco de teclado y diseño adaptable con
  los colores y espaciados existentes. Se conservan carga, error/reintento,
  lista vacía y ausencia de coincidencias como estados diferenciados.
- Cambiar controles no vuelve a consultar la API. Los efectos de carga existentes
  descartan respuestas posteriores al desmontaje; no hay solicitudes de búsqueda
  cuyas respuestas puedan reemplazarse fuera de orden.

## Parámetros de navegación (solo frontend)

No cambian los contratos HTTP ni los parámetros de API anteriores.

| Parámetro | Uso |
| --- | --- |
| `q` | Texto de búsqueda; control limitado a 160 caracteres. |
| `estado` | Valores existentes de cada módulo: cursos `publicados/borradores/archivados`, productos `published/withdrawn`, solicitudes `pendientes/contactadas/confirmadas/descartadas`. Ausente = todos. |
| `tipo` | Clasificación existente del curso o `sin-tipo`. |
| `categoria` | ID de categoría del producto o `sin-categoria`. |
| `disponibilidad` | `true` o `false`. |
| `curso` | ID del curso en solicitudes. |
| `desde`, `hasta` | Fechas `YYYY-MM-DD` de solicitudes, inclusivas en Costa Rica. |
| `orden` | Según el módulo: `name-asc/desc`, `price-asc/desc`, `created-asc/desc`, `updated-desc`. |
| `pagina` | Entero positivo, 20 registros por página; se ajusta al rango válido. |

## Archivos

- Compartidos: `apps/web/src/components/admin/AdminListTools.jsx` y su CSS,
  `apps/web/src/hooks/useAdminList.js`, `apps/web/src/utils/adminList.js`.
- Listados: `CoursesList.jsx`, `ProductsList.jsx`, `EnrollmentRequests.jsx` y
  `EnrollmentRequests.module.css` en `apps/web/src/pages/admin`.
- Retorno: `CourseDetail.jsx`, `CourseEdit.jsx`, `ProductDetail.jsx`,
  `ProductEdit.jsx`, `ProductCreate.jsx` en el mismo directorio;
  `apps/web/src/components/ui/Notice.jsx` admite estado opcional en su enlace.
- Pruebas: `apps/web/tests/admin-list.unit.test.mjs`, `admin-lists.browser.jsx`,
  `admin-lists.html`, `run-browser.mjs`; `apps/web/package.json` incluye todas las
  pruebas unitarias existentes al ejecutar `test:unit`.

## Validación y límites

- Pruebas ligeras: `npm run test:unit --workspace web`, 23 aprobadas
  (6 nuevas, 17 existentes); lint web aprobado; `git diff --check` sin errores.
- Build web aprobado antes de la petición de limitarse a pruebas ligeras.
  Advertencia existente de bundle mayor a 500 kB.
- Antes de esa petición se ejecutó la suite API: 1103 pruebas aprobadas, 29 archivos.
  El primer intento dentro del sandbox tuvo errores `EACCES` de conexión local;
  la repetición con acceso local pasó. No se modificó backend.
- La suite de navegador anterior pasó. La nueva suite verificó búsqueda,
  combinaciones, paginación, errores, listas vacías y retorno desde solicitudes en
  1280 y 390 px. Un caso nuevo de guardado de edición falló; se ajustó para esperar
  las categorías y modificar realmente un campo antes de guardar. Ese ajuste
  **no se volvió a ejecutar** para respetar la instrucción de no levantar servidores.
  La validación de ese caso queda pendiente.
- No existen scripts de typecheck, lint o build en API ni typecheck en web.

La paginación es de presentación y no reduce las lecturas completas que ya
realizaban los endpoints. No se introducen escaneos nuevos ni lecturas por tecla,
filtro o página. Para grandes volúmenes, la carga inicial y el filtrado en memoria
siguen teniendo un costo proporcional al total de registros. Pasar a paginación
de servidor requiere diseñar búsqueda parcial compatible con Firestore y sus
índices; truncar los arrays actuales rompería la búsqueda global. No se aplicó ese
cambio de arquitectura. Los totales representan la última carga exitosa; otros
administradores pueden modificar registros hasta la próxima carga.
