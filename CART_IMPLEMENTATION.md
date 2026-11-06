# Carrito local para consultar disponibilidad

## Base y alcance

Rama: `feat/ciu-carrito-consultas-whatsapp`, creada desde `main` limpio tras `git fetch origin main` y actualización mediante `--ff-only`. Base: `ff9833f` (merge del PR #49). No se mezclaron cambios locales anteriores. La implementación principal está confirmada en el commit `73a254d` (`feat(web): add local cart for WhatsApp availability inquiries`), publicado en la rama remota, y tiene el [PR #50](https://github.com/JusMH/ciudad-pastel/pull/50) abierto hacia `main`. Se verificó que el head del PR coincide con ese commit. Las correcciones de revisión descritas a continuación permanecen como cambios locales: no se realizaron nuevos commits, push ni merge.

La funcionalidad vive en `apps/web`. No hay endpoints, colecciones, reglas de Firestore, pedidos, reservas, pagos ni autenticación nuevos. Los contratos públicos y el funcionamiento de cursos/matrículas se conservan.

## Correcciones de revisión del PR #50

1. **Scroll de categorías:** la restauración espera la vista activa: categorías cuando se muestra la portada y productos cuando se muestra el listado. No se solicitan páginas de productos para restaurar categorías. La regresión de navegador desplaza una portada de treinta categorías, abre el carrito, retrasa la respuesta de categorías al volver y comprueba el scroll real después de renderizar la cuadrícula, con tolerancia de un píxel. Conserva la comprobación existente del listado filtrado.
2. **Mensaje de una línea:** `buildCartAvailabilityMessage` usa «Me interesa el producto … (N unidad/unidades). ¿Podrían confirmarme si está disponible?» para un producto distinto, respetando su cantidad. Varias líneas mantienen el mensaje plural. `buildIndividualAvailabilityMessage` no cambia: sigue consultando una unidad, independientemente de la cantidad del carrito.
3. **Adición rechazada desde el modal:** `applyCartAction` indica `success` y el motivo de la adición; el provider devuelve ese mismo resultado. Un rechazo no modifica el estado de la selección ni reescribe `localStorage`. El modal permanece abierto, conserva el foco dentro y anuncia el motivo con `role=alert` en su interior. Un éxito actualiza el contador y cierra normalmente. El mensaje local es solo presentación del error; la selección sigue perteneciendo únicamente al provider. Se prueban ambos límites y el reintento satisfactorio tras liberar espacio/cantidad en el estado compartido.
4. **Documentación:** se corrigió el estado de publicación de la rama y se separaron las verificaciones actuales de la suite de API ejecutada durante la implementación original.

Estos ajustes se limitan a `ProductsList.jsx`, `utils/whatsapp.js`, `utils/cart.js`, `CartProvider.jsx`, `WhatsAppButton.jsx`, las pruebas `cart.unit.test.mjs`/`cart.browser.jsx` y este documento. No hay cambios de API, Firestore, contratos públicos, autenticación, cursos, matrículas ni dependencias.

## Arquitectura y persistencia

- `CartProvider` + `useCart` poseen la selección compartida. Catálogo, detalle, contador y página del carrito usan ese mismo estado. La referencia interna sincronizada permite procesar adiciones consecutivas sin perder incrementos; no existen carritos independientes por página.
- Clave: `ciudad-pastel.cart.v1`. Valor: arreglo de líneas con `id`, `name`, `price`, `imageUrl`, `available`, `quantity`. No se guardan teléfono, plantilla de WhatsApp, tokens, información de sesión ni datos personales del visitante.
- Las líneas se identifican por ID. Agregar empieza en 1 o incrementa la línea existente. Solo se admiten enteros de 1 a 99; eliminar requiere una acción explícita. Límite: 20 productos distintos. Ambos límites se muestran en la interfaz y son constantes comprobadas en pruebas.
- Se validan tipos, precios, identificadores y nombres; las imágenes solo admiten HTTP/HTTPS. Los campos adicionales del producto no se persisten. JSON inválido, estructuras inesperadas y cargas superiores a 50.000 caracteres se recuperan sin bloquear la aplicación. Líneas almacenadas inválidas se descartan con aviso; IDs duplicados se consolidan.
- Lecturas/escrituras bloqueadas producen mensajes comprensibles. La selección nueva sigue disponible en memoria si no se puede persistir. Cambios válidos recibidos por `storage` se reflejan sin escribir de vuelta y sin bucles; datos externos corruptos conservan la selección actual.
- La sincronización entre pestañas aplica el último estado recibido; no es una combinación transaccional de ediciones simultáneas. Borrar datos del navegador elimina esta selección local.

## Flujos de usuario

### Catálogo y detalle

«Agregar al carrito» se encuentra fuera del enlace de la tarjeta y funciona aunque WhatsApp no esté configurado. No navega ni modifica búsqueda, filtros o bloques cargados; emite una confirmación visual con `role=status`. El contador público muestra unidades y utiliza `ShoppingCart` de Lucide.

`/tienda/carrito` es una ruta estática bajo el layout público, compatible con `/tienda/:id`. Se recuerda el origen del catálogo al abrir el carrito desde la navegación: al seguir explorando se recuperan filtros, bloques y desplazamiento. Desde el detalle se puede regresar al catálogo, y desde una línea del carrito se puede visitar el detalle y volver al carrito.

### Consulta individual

Un producto concreto abre primero el diálogo «¿Necesitas algún otro producto?», que identifica nombre y agotamiento publicado. Permite agregar y continuar, consultar exclusivamente una unidad, o cancelar. Consultar una unidad no agrega, elimina ni incluye otras líneas del carrito.

Se reutilizan `<dialog>.showModal()` y los estilos del patrón existente de `ConfirmDialog`; el diálogo de producto tiene título y descripción con IDs únicos, `role=dialog`, `aria-modal`, foco inicial en Cancelar y restauración al disparador con `preventScroll`. La modalidad nativa impide enfocar controles del fondo y genera `cancel` con Escape. No hay biblioteca nueva de modales.

Consultas genéricas sin producto (p. ej. búsqueda vacía) conservan la plantilla de WhatsApp configurada y su enlace directo, sin diálogo de producto.

### Página del carrito

Muestra imagen o placeholder, enlace al detalle, precio de referencia, estado de verificación, disponibilidad publicada, cantidad editable, controles +/- y eliminación. Incluye unidades, productos distintos, subtotal de referencia y advertencia de que no es una cotización ni confirmación. Vaciar exige confirmación. Un carrito vacío ofrece explorar productos y no presenta una consulta habilitada.

El foco llega al encabezado al entrar y después de eliminar/vaciar. Los estilos usan las variables existentes y se adaptan a móvil. Los errores no destruyen líneas ni las eliminan automáticamente.

## Información publicada y eficiencia

`cartValidation.service.js` utiliza únicamente `GET /products/:id`, sin consultas de Firestore desde el frontend.

1. Al entrar al carrito o cambiar sus IDs se revisa la selección. Cambiar únicamente cantidades o renderizar de nuevo no genera solicitudes de productos.
2. Inmediatamente antes de preparar la consulta se verifica otra vez para detectar retiros, cambios de precio o disponibilidad ocurridos mientras el carrito estaba abierto.
3. Máximo cuatro solicitudes concurrentes y veinte productos por revisión. Una respuesta solo actualiza el snapshot de una línea aún existente, conservando su cantidad; no resucita productos eliminados.
4. Un producto agotado sigue siendo consultable con advertencia explícita de agotamiento y posible disponibilidad futura. Un 404 se identifica como retirado/no público: se conserva la línea y debe eliminarse antes de consultar la selección restante.
5. Un fallo de conexión o respuesta inválida conserva los datos anteriores, los identifica como no verificados y permite reintentar. No se prepara un enlace conjunto con verificaciones fallidas. Los precios guardados se presentan como referencia y los cambios se incorporan al subtotal.

La validación tiene un máximo de veinte GET por revisión, no un endpoint de lotes nuevo. No puede garantizar disponibilidad en tiempo real: los datos pueden cambiar después de la lectura y el negocio confirma por WhatsApp.

## WhatsApp

- `contact.service.js` conserva su petición compartida a `GET /contact/whatsapp`; añade un refresco explícito para reintentos. `useWhatsAppContact` mantiene su retorno anterior y `useWhatsAppContactState` permite distinguir carga/contacto no disponible en el carrito.
- La validación del contacto, codificación y construcción de enlaces se concentran en `utils/whatsapp.js`. La función anterior `buildWhatsAppProductLink` sigue exportándose desde el servicio y respeta la plantilla para consultas genéricas.
- Los mensajes concretos consultan disponibilidad: una unidad en consulta individual o las cantidades reales del carrito en la conjunta. No contienen precios, cotizaciones, reservas ni confirmación de pedidos. Los caracteres especiales se codifican en la URL.
- El teléfono siempre procede del contacto validado de la API, nunca de una línea almacenada ni de una constante de producción.
- Tras pulsar «Consultar disponibilidad por WhatsApp», la página verifica la selección y presenta un enlace explícito «Abrir WhatsApp con la consulta». Este segundo gesto permite abrir la pestaña después de la verificación asíncrona sin depender de ventanas emergentes bloqueadas. El usuario revisa y envía el mensaje desde WhatsApp; no se afirma que haya sido enviado y no se vacía el carrito.
- Cualquier cambio en selección, cantidades o información publicada invalida el mensaje preparado; si cambia la selección entre pestañas durante la revisión, el mensaje anterior no queda habilitado para la nueva selección.
- Se aplica un límite conservador de 2.000 caracteres a la URL completa ya codificada. Si se excede, no se trunca: se muestra el mensaje completo en un área seleccionable y se ofrece reducir la selección o copiar/pegar en «Abrir chat sin mensaje», con el mismo teléfono configurado. Sin contacto válido no se generan enlaces.

## Archivos

| Grupo | Archivos |
| --- | --- |
| Estado y almacenamiento | `apps/web/src/cart/CartProvider.jsx`, `CartContext.js`, `useCart.js`, `CartProvider.module.css`; `apps/web/src/utils/cart.js` |
| Mensajes y validación pública | `apps/web/src/utils/whatsapp.js`; `apps/web/src/services/cartValidation.service.js`, `contact.service.js`; `apps/web/src/hooks/useWhatsAppContact.js` |
| Componentes | `apps/web/src/components/public/AddToCartButton.jsx`, `PreparedWhatsAppLink.jsx`, `WhatsAppButton.jsx`, `WhatsAppButton.module.css` |
| Integración | `apps/web/src/main.jsx`, `App.jsx`; `apps/web/src/components/public/PublicLayout.jsx`; `apps/web/src/pages/public/ProductsList.jsx`, `ProductsList.module.css`, `ProductDetail.jsx` |
| Página nueva | `apps/web/src/pages/public/Cart.jsx`, `Cart.module.css` |
| Pruebas | `apps/web/tests/cart.unit.test.mjs`, `cart.html`, `cart.browser.jsx`, `cart-persistence.html`, `cart-persistence.browser.jsx`; ampliación de `run-browser.mjs`, envoltura con provider en `ux.browser.jsx`, script en `apps/web/package.json` |
| Documentación | `CART_IMPLEMENTATION.md` |

## Verificaciones ejecutadas

- `npm run test:unit -w web`: **14 pruebas aprobadas** con `node:test`, sin dependencias nuevas. Cubren adiciones, ID/duplicados, límites, enteros, eliminación/vaciado, snapshots, datos corruptos, actualización sin resurrección, mensajes, compatibilidad de plantilla, contacto, codificación y URL excesiva.
- `npm run test:ux -w web`: **62 comprobaciones aprobadas**, en Edge sin interfaz a 1280×900 y 390×844: 12 escenarios anteriores + 17 del carrito + 2 fases de persistencia por tamaño. Las dos fases usan documentos/procesos nuevos de navegador y comparten únicamente el perfil temporal y su `localStorage`.
- Las regresiones añadidas en la revisión comprueban scroll real de categorías sin páginas de productos, mensaje singular de una línea para 1 y varias unidades, plural de varias líneas y rechazo accesible del modal para 20 productos y 99 unidades, sin escrituras/reemplazo de la selección y con reintento satisfactorio.
- La cobertura del carrito comprueba adición desde catálogo y detalle, repetición, contador, cantidades inválidas y controles, eliminación, vaciado/cancelación, almacenamiento corrupto/bloqueado, evento `storage`, modalidades del diálogo, foco del fondo bloqueado, restauración de foco, mensajes individuales/conjuntos, ausencia/reintento de contacto, agotados, 404, conexión fallida, actualización de precio tanto al entrar como antes de consultar, retiro posterior a la entrada, consultas largas sin truncamiento, vuelta con filtros/bloques/scroll y ancho responsive.
- Las peticiones de las pruebas públicas están simuladas y rechazan métodos distintos de GET. El fixture existente aísla Firebase. Los enlaces externos se inspeccionan y se evita su navegación real al probar clics; no se envían mensajes ni se escriben datos en Firestore.
- `npm run lint -w web`: aprobado.
- `npm run build -w web`: aprobado; permanece la advertencia de Vite por bundle JS superior a 500 kB.
- **Verificación histórica de la implementación original:** `npm run test -w api -- --reporter=dot --maxWorkers=1`: 18 suites / 861 pruebas aprobadas, con repositorios simulados. No se volvió a ejecutar la suite de API en estas cuatro correcciones: no se modificó código ni contrato de API. Las verificaciones actuales son unitarias, navegador, lint, build y `git diff --check`.
- `git diff --check`: aprobado.

En este entorno Windows se utilizó `node_modules/.cache/ux-temp` como temporal y se habilitaron conexiones localhost para Vite/Supertest. El runner existente utiliza un perfil de navegador aislado que elimina al terminar.

## Límites y verificación manual pendiente

- Se requiere almacenamiento del navegador para sobrevivir a cierres/recargas; cuando está bloqueado, se avisa y solo se conserva la selección en memoria.
- No hay reserva de existencias ni garantía de precio/disponibilidad después de verificar. Un producto retirado o no verificable bloquea la consulta conjunta hasta eliminarlo o reintentar satisfactoriamente.
- El evento `storage` se prueba mediante un evento simulado del navegador, no con dos personas editando pestañas simultáneamente. La persistencia entre documentos/procesos sí se comprobó.
- Se comprobó contención/restauración de foco del diálogo nativo y el evento `cancel` que produce Escape. Queda una revisión manual con teclado físico, lector de pantalla y navegadores móviles reales; el tamaño móvil automatizado es un viewport de Edge.
- Queda abrir los enlaces con WhatsApp real (web y aplicación móvil) y el teléfono configurado del entorno de despliegue. No se enviaron consultas reales ni se comprobó el inventario del negocio.
- No hubo rediseño general, cambios de reglas de negocio, migraciones ni dependencias nuevas.
