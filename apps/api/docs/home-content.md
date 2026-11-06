# Portada editorial — contenido administrable (2026-11)

La ruta `/` conserva las frases y paleta del prototipo editorial de MagicPath, adaptado a CSS Modules.
Solo imágenes y "Sobre nosotros" son editables. No hay un bloque "Contáctanos": el contacto oficial sigue por WhatsApp existente.

## Contratos
- `GET /api/site/home`: público, `Cache-Control: no-store`, contenido o valores predeterminados cuando falta `site_content/home`.
- `GET /api/admin/site/home`: solo administrador.
- `PUT /api/admin/site/home`: solo administrador; reemplazo del documento validado.
- `POST /api/admin/site/home/image`: solo administrador, multipart campo `file`, máximo 5 MiB, JPEG/PNG/WebP; respuesta 201 `{url,publicId}` de Cloudinary.

Ejemplo de contenido:
```json
{
  "heroImageUrl": null,
  "storeImageUrl": "https://example.org/tienda.jpg",
  "about": {
    "visible": false,
    "title": "Sobre nosotros",
    "description": "",
    "imageUrl": null
  }
}
```
Las URLs deben ser HTTPS y de hasta 1000 caracteres. La API persiste solo campos permitidos, sin HTML arbitrario. La sección "Sobre nosotros" está oculta inicialmente; se vuelve visible después de que la dueña redacte y publique su contenido. Los eslóganes siguen definidos en el frontend para revisión posterior con la clienta.

## Configuración del backend
Crear una cuenta Cloudinary Free. Configurar SOLO en `apps/api/.env` (nunca en `VITE_*` ni Git):
```dotenv
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```
Reiniciar API después de configurar. El servidor utiliza Basic Authentication del API de Cloudinary por HTTPS y almacena archivos nuevos bajo `ciudad-pastel/home`. Sin credenciales, el endpoint de subida responde 503; se sigue pudiendo configurar una URL externa.

**Límites:** Cloudinary Free utiliza créditos mensuales compartidos entre almacenamiento, ancho de banda y transformaciones. Monitorizar consumo desde el panel Cloudinary y tener cuidado con las fotografías grandes. Las subidas incompletas, cambios de opinión o sustituciones pueden dejar imágenes sin referencia en Cloudinary; su limpieza aún es manual y no debe eliminar automáticamente archivos compartidos.

## Flujo de administradora
1. Entrar a `/admin/pagina-inicio`.
2. En cada bloque elegir subir una imagen a Cloudinary o pegar una URL externa HTTPS. Visualizar la fotografía.
3. Rellenar "Sobre nosotros" y activar el interruptor de visibilidad si se desea.
4. Guardar los cambios. Subir un archivo **no publica** la página hasta pulsar "Guardar cambios".
5. Verificar la página pública `/`.

**Google Drive:** un enlace que abre el visor de Drive (`drive.google.com/file/d/...`) NO equivale a un enlace de imagen directa; el navegador puede no mostrarlo en una etiqueta `img`. Las imágenes externas han de ser accesibles públicamente y funcionar como URL directa. La previsualización del formulario ayuda a detectarlo.

## Alcance
- La portada usa `GET /api/courses` para mostrar hasta dos cursos publicados reales y `GET /api/categories` para enlaces de categorías existentes, sin datos inventados.
- No modifica la persistencia ni el proceso de subida de imágenes de productos o cursos; esas mejoras vendrán en PR separados.
- El contacto de la portada utiliza la configuración pública de WhatsApp existente.
- No se requiere instalar el SDK Cloudinary (se utiliza `fetch`, `FormData` y `Blob` disponibles en Node 20+).
- Validar con la clienta fotografías y copy antes de un despliegue público.
