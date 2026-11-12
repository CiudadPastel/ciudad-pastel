# Importar productos desde un catálogo

El script `scripts/import-products.js` sube a la tienda muchos productos de una vez, desde una hoja (CSV) y una carpeta de fotos. Así no hay que crearlos uno por uno en el panel.

## La hoja

Las columnas son: `importar; catalogo; pagina; nombre; categoria; precio; peso; tamano; marca; descripcion; disponible; imagen; notas`.

- **importar:** solo se importan las filas con `sí`. Las que dicen `no` o `revisar` se saltan.
- **categoria:** se busca por nombre, sin importar mayúsculas ni tildes. Si no existe, se crea.
- **precio:** acepta `1750`, `₡ 1.750` o `1,750`.
- **imagen:** el nombre de un archivo de la carpeta `fotos` (junto a la hoja), o una dirección `https://` que ya exista.
- **disponible:** `sí` o `no`. Si se deja vacío, el producto queda disponible.
- Todo se valida con las mismas reglas del panel de administración.

La hoja se puede editar en Excel. Al guardarla, use **CSV UTF-8**. Si se guarda en otro formato, el script igual lee bien las tildes.

## Cómo correrlo (desde la raíz del proyecto)

```bash
# 1. Prueba: muestra qué se va a crear y qué filas tienen problemas. No guarda nada.
node apps/api/scripts/import-products.js "C:/ruta/catalogos/productos.csv"

# 2. Si todo se ve bien, guardar:
node apps/api/scripts/import-products.js "C:/ruta/catalogos/productos.csv" --apply
```

Opciones:

- `--fotos <carpeta>`: si las fotos no están en `fotos/` junto a la hoja.
- `--sin-fotos`: importa sin subir fotos; la tienda muestra la imagen por defecto.
- `--actualizar`: vuelve a escribir productos que ya se importaron antes. Esto **pisa** los cambios hechos en el panel.

## Reglas

- **Id fijo:** cada producto tiene un id fijo armado con el catálogo y la página (`cat-moldes-de-silicon-p3`). Correr el script dos veces no duplica productos: los que ya existen se saltan.
- **Fotos:** se suben a Cloudinary con las mismas variables que usa la página de inicio (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` en `apps/api/.env`). Quedan en la carpeta `ciudad-pastel/productos/`.
- **Estado:** los productos se crean publicados. Después se editan o se quitan desde el panel, como cualquier otro producto.
