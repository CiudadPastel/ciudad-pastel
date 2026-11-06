# Portada editorial: publicación y ciclo de vida de imágenes

La portada conserva el diseño editorial, los eslóganes y «Sobre nosotros» editable. No se agrega «Contáctanos» ni se cambia la subida de productos/cursos.

## Causas verificadas

- `PublicLayout.openCart`: `inCatalog && find(...)` producía `false` fuera del catálogo. `false?.dataset.productId` no detiene el acceso: `dataset` es undefined. Ahora se utiliza null y se protege también dataset. La condición inicial que respeta clic central y Ctrl/Meta/Shift/Alt permanece intacta.
- La selección de archivo enviaba un POST inmediatamente, antes de publicar; solo se retenía la URL. Firestore no tenía pruebas de propiedad ni identificadores con los que recuperar archivos abandonados o retirar sustituciones.
- El servicio de WhatsApp eliminaba de su caché cualquier resultado sin contacto, incluido el 404 esperado. Cada nuevo consumidor podía repetir la petición.

## Contratos y compatibilidad

- `GET /api/site/home`: público, sin caché HTTP. Lee `site_content/home`, conserva campos de URL anteriores y devuelve `revision` (0 para documentos antiguos).
- `GET /api/admin/site/home`: autenticación y permiso admin; también reintenta la limpieza pendiente.
- `PUT /api/admin/site/home`: autenticación y permiso admin. Acepta JSON para enlaces HTTPS o multipart con `content` (JSON) y hasta un archivo por campo `heroImageUrl`, `storeImageUrl`, `aboutImageUrl`. Máximo 5 MiB por archivo, JPEG/PNG/WebP con comprobación de tamaño, MIME y cabecera binaria. Valida todos los archivos antes de subir.
- La revisión recibida debe coincidir con Firestore. Una edición obsoleta responde 409; se debe recargar y revisar los datos antes de volver a guardar. Los clientes antiguos sin revisión se aceptan solo antes de la primera publicación versionada.
- `POST /api/admin/site/home/image` conserva la ruta y la protección administrativa, pero responde 409 indicando que la subida debe acompañar al guardado. Un frontend antiguo no puede seguir generando archivos independientes.
- Los campos desconocidos y cualquier metadata de propiedad enviada por el cliente se descartan. Los campos ausentes de documentos heredados reciben los valores predeterminados; null conserva la intención de quitar una imagen. No hay migración destructiva.

## Selección, publicación y eliminación

1. Seleccionar un archivo solo crea una previsualización `blob:` local. Sustituir, descartar o salir antes de guardar no sube archivos. Las URLs locales se revocan al cambiar la previsualización o desmontar el componente.
2. «Guardar cambios» envía contenido y archivos juntos. El backend comprueba permisos, contenido, cabeceras y revisión.
3. Antes de contactar Cloudinary, el backend registra un UUID propio en `site_content/home/image_assets/{uuid}` con `publicId`, cuenta, tipo de recurso, tipo de entrega, estado y fecha. El namespace es `ciudad-pastel/home/{uuid}` y no se sobrescriben recursos.
4. Cloudinary devuelve URL HTTPS, public ID y asset ID; se verifican y registran únicamente en el backend. React no necesita administrar identificadores ni recibe el secreto.
5. Una transacción lee la portada y el registro, vuelve a comprobar la revisión y escribe las URLs, la revisión siguiente y los identificadores de los recursos publicados en `site_content/home.imageAssets`. La confirmación de commit precede a toda eliminación de imágenes sustituidas.
6. La limpieza reclama cada recurso en una transacción que vuelve a comprobar **las tres URLs** de la portada. Conserva imágenes usadas por otro bloque, incluso si se copiaron sus enlaces entre bloques. Solo elimina recursos con registro creado por este backend. No infiere propiedad desde URLs, carpetas remotas ni documentos heredados.
7. Los recursos activos sin referencias se retiran después de publicar. Los registros pendientes esperan una hora antes de retirarse: un timeout del upload puede terminar remotamente después de perder su respuesta. Un error de Firestore conserva la publicación anterior y deja el intento nuevo registrado para recuperación.
8. La eliminación usa firma del backend, cuenta y namespace verificados. Fallos de Cloudinary conservan el estado `deleting` y se reintentan. Una eliminación ya realizada (`not found`) es éxito. Se conservan tombstones `deleted` para impedir que una edición obsoleta vuelva a publicar un recurso eliminado.

No hay endpoint que permita al cliente escoger un public ID para borrar. Las imágenes externas y las Cloudinary antiguas que solo tienen URL se conservan: su propiedad no está demostrada. Los IDs no se reconstruyen a partir de enlaces.

**Concurrencia y red:** las transacciones y revisiones impiden sobrescribir otra edición y coordinan publicación con limpieza. Dos guardados simultáneos pueden subir archivos, pero solo uno publica; el otro devuelve 409 y sus recursos quedan registrados para limpieza. Una respuesta perdida después del commit puede significar que sí se publicó: el formulario pide recargar y comprobar el resultado, evitando afirmar un fracaso definitivo. Un recurso reclamado para eliminación no puede reincorporarse a la portada por una URL obsoleta.

## Configuración

Solo en el backend (`apps/api/.env`, nunca en `VITE_*` ni en Git): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Reiniciar la API al cambiar configuración. Firestore utiliza las credenciales administrativas existentes.

WhatsApp conserva el contrato HTTP existente: 404 cuando falta `WHATSAPP_CONTACT_PHONE`. Se comparte la petición en curso, incluidos reintentos; se almacena el 404 durante 60 segundos, otros fallos durante 10 segundos y respuestas válidas durante 5 minutos. «Reintentar contacto» evita esperar la caducidad. El carrito sigue siendo navegable y explica que no puede preparar la consulta sin contacto. No se introduce ningún número.

## Verificación automatizada

Ejecutado el 6 de noviembre de 2026:

- `npm run lint -w apps/web`: correcto.
- `npm run build -w apps/web`: correcto; Vite advierte que el bundle principal supera 500 kB.
- `npm test -w apps/api`: 24 archivos, 957 pruebas correctas.
- `npm run test:unit -w apps/web`: 14 pruebas correctas.
- `npm run test:ux -w apps/web`: 74 comprobaciones correctas en Chromium, 1280×900 y 390×844; suites de catálogo/cursos, carrito, integración de portada y persistencia tras recarga del documento.

Las pruebas API usan un doble transaccional de Firestore y Cloudinary simulado; las pruebas de transporte verifican IDs, firma, configuración y respuestas fallidas mediante fetch simulado. El navegador utiliza componentes reales con HTTP y sesión Firebase simulados, y una imagen local servida por Vite. Se comprueba selección/descartar sin subidas, publicación autenticada, lectura posterior en editor y portada, fallos y caché WhatsApp. No constituyen una prueba contra las cuentas reales de Firestore/Cloudinary.

El sandbox inicialmente impidió temporales y conexiones locales; las suites completas se ejecutaron correctamente fuera de esas restricciones. No se alteró la configuración del producto para resolver ese problema del entorno.

## Validación manual con servicios reales

1. Iniciar sesión como administradora y abrir `/admin/pagina-inicio`. Abrir Network y consultar `site_content/home` en Firestore.
2. Seleccionar una imagen en cada uno de los tres bloques. Confirmar la previsualización y ausencia de PUT/POST al seleccionar. Descartar: Cloudinary y Firestore deben permanecer sin cambios.
3. Seleccionar de nuevo y pulsar «Guardar cambios». Confirmar un PUT multipart autenticado, respuesta satisfactoria y nueva revisión. Verificar las tres URLs en `site_content/home`, sus identificadores en `imageAssets` y el registro `image_assets`.
4. Recargar el editor y abrir/recargar `/`: deben mostrarse las imágenes nuevas y mantenerse el contenido de «Sobre nosotros».
5. Sustituir una foto y guardar. Confirmar que la nueva URL está publicada antes de que desaparezca el recurso anterior de Cloudinary. Copiar la URL administrada a otro bloque y guardar; sustituir solo la primera: la foto compartida debe conservarse hasta retirar la última referencia.
6. Publicar una URL HTTPS externa y sustituirla: no debe recibir solicitudes de borrado. Los archivos antiguos con solo URL tampoco deben borrarse automáticamente.
7. En un entorno de pruebas, simular un error de escritura de Firestore después de subir: la portada anterior debe mantenerse. Restaurar Firestore y, pasada una hora, abrir administración para comprobar la limpieza del intento pendiente. Simular un fallo de eliminación Cloudinary y comprobar que se reintenta al abrir administración.
8. Abrir el editor en dos pestañas, guardar en una y luego en la otra: la segunda recibe conflicto y solicita recargar. Simular pérdida de respuesta al guardar y comprobar Firestore antes de reintentar.
9. Sin sesión y con usuario no administrador, comprobar 401/403 en lectura, guardado y antigua ruta de subida, sin llamadas a Cloudinary.
10. Sin `WHATSAPP_CONTACT_PHONE`, navegar catálogo → detalle → carrito → cursos. Confirmar un solo 404 por minuto, carrito accesible, mensaje claro y reintento explícito. Configurar el número real en el servidor y reintentar.
11. Comprobar carrito desde catálogo, detalle, cursos/listado/detalle y otras páginas públicas; volver al catálogo conserva filtros, desplazamiento y foco. Ctrl/Meta/Shift/Alt+clic y clic central conservan sus operaciones del navegador.

## Límites pendientes

- La limpieza es oportunista: se ejecuta en accesos administrativos y después de publicar. Si nadie vuelve a administración, los recursos pendientes registrados permanecen hasta el siguiente acceso. No se añadió un servicio de tareas ni un scheduler. Para una garantía temporal sin actividad se requeriría programar este mismo proceso autenticado desde la infraestructura.
- El registro y sus tombstones crecen y se leen para coordinar las referencias. Es una solución deliberadamente sencilla para tres fotografías y un volumen administrativo pequeño; a gran volumen convendría paginar/consultar estados y archivar registros con una política que preserve la protección frente a URLs retiradas.
- La garantía de referencias cubre los tres bloques editables de portada, no usos manuales de esos recursos fuera de la aplicación. No cambiar de cuenta Cloudinary sin gestionar primero los recursos de la cuenta anterior: la limpieza los conserva al detectar discrepancia.
- Los archivos Cloudinary anteriores sin identificadores requieren revisión manual de propiedad; no se adopta ni borra contenido por inspección de su URL.
- Falta la validación manual contra las cuentas reales y la revisión final de la administradora. No se publicaron datos ni imágenes en producción durante estas pruebas.

## Archivos modificados

- Backend: `src/repositories/home-content.repository.js`, `src/routes/home-content.routes.js`, `src/services/home-image.service.js`, `src/validators/home-content.validator.js` (bajo `apps/api`).
- Frontend: `src/components/public/PublicLayout.jsx`, `src/pages/admin/HomeContent.jsx`, `src/pages/public/Cart.jsx`, `src/services/homeContent.service.js`, `src/services/contact.service.js` (bajo `apps/web`). El hook WhatsApp existente ya ofrece reintento y utiliza la caché compartida corregida; no necesita cambios.
- Pruebas API: `tests/home-content.api.test.js`, `tests/home-content.test.js`, `tests/home-image.service.test.js`, `tests/helpers/home-firestore.js`.
- Pruebas web: `tests/cart.browser.jsx`, `tests/home-integration.browser.jsx`, `tests/home-integration.html`, `tests/run-browser.mjs`.
- Documentación: este archivo. Sin dependencias nuevas. El cambio local previo de `package-lock.json` queda fuera de la revisión.
