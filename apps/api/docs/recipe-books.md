# HU-A03 — Carga y Vinculación de Recetarios en PDF

Este documento define las reglas de negocio, decisiones arquitectónicas y preguntas abiertas para la gestión de recetarios en formato PDF vinculados a cursos en Ciudad Pastel.

---

## 1. Reglas de Negocio Propuestas

| # | Regla | Detalle | Estado |
|---|---|---|---|
| 1 | **Formato exclusivo PDF** | Solo se admiten archivos con `Content-Type: application/pdf` y cuya firma inicial de 5 bytes corresponda a `%PDF-`. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 2 | **Tamaño máximo** | Hasta 20 MiB (20 971 520 bytes). Los archivos vacíos (0 bytes) son rechazados. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 3 | **Cantidad por curso** | Un curso puede tener un máximo de 10 recetarios asociados. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 4 | **Pertenencia única** | Un recetario pertenece a un único curso. No se reasigna entre cursos (si se requiere cambiar, se elimina y se carga de nuevo). | PROPUESTA — falta confirmar con Ciudad Pastel |
| 5 | **Título descriptivo** | Opcional, entre 3 y 120 caracteres tras aplicar `trim`. Si se omite, se usa el nombre base del archivo sin la extensión `.pdf`. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 6 | **Disponibilidad por estado** | Se pueden asociar recetarios a cursos en borrador, publicados o archivados. Archivar un curso conserva sus recetarios intactos. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 7 | **Eliminación permanente** | La eliminación borra de forma definitiva tanto los metadatos como el contenido del archivo. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 8 | **Privacidad y acceso** | En esta fase (HU-A03), los recetarios son gestionados exclusivamente por administradores. El acceso para estudiantes matriculados corresponde a HU-A06. | PROPUESTA — falta confirmar con Ciudad Pastel |

---

## 2. Preguntas para la Clienta (Yamilena Blanco Chaves)

1. **Cantidad:** ¿Cuántos recetarios suele tener un curso habitualmente? ¿Es suficiente un límite de hasta 10 documentos por curso?
2. **Reutilización:** ¿Un mismo recetario llega a utilizarse en cursos distintos, o cada curso siempre tiene sus propios recetarios específicos?
3. **Peso y origen:** ¿Los documentos PDF son digitales generados en computadora o pueden ser escaneados con imágenes de alta resolución? ¿Es suficiente el tope de 20 MB?
4. **Dispositivos de carga:** ¿Quién se encargará de subir los recetarios y desde qué dispositivos (computadora de escritorio, laptop o teléfono móvil)?
5. **Borrado:** Al eliminar un recetario por error o actualización, ¿es correcto que se borre definitivamente del sistema?

---

## 3. Respuestas de Ciudad Pastel

> *Espacio reservado para registrar formalmente las respuestas de la clienta:*
> - **Tamaño de archivos:** Se informó que los recetarios pueden llegar a pesar hasta 20 MB (incorporado en la propuesta).
> - *(Respuestas restantes pendientes de confirmación formal)*

---

## 4. Decisión de Almacenamiento

- **Estrategia seleccionada:** Estrategia A — Fragmentación en Firestore (`recipeBooks/{id}/chunks/{0000, 0001, ...}`).
- **Motivación:** Desde febrero de 2026, Cloud Storage for Firebase exige el plan Blaze (de pago por consumo). Dado que el Project Charter de Ciudad Pastel establece operar sin financiamiento externo, se utiliza el plan Spark (gratuito) almacenando los archivos en Firestore en fragmentos de 800 KB (`CHUNK_SIZE = 800_000`).
- **Límites y consumo:** Un documento en Firestore tiene un límite cercano a 1 MiB. Para un archivo de 5 MiB se emplean ~7 fragmentos, y para un archivo de 20 MiB ~26 fragmentos. La cuota diaria gratuita de Firestore en plan Spark ofrece 20.000 escrituras y 50.000 lecturas al día, suficiente para el flujo académico de Ciudad Pastel.
- **Aislamiento y portabilidad:** Toda la interacción de lectura/escritura de archivos está encapsulada en `apps/api/src/storage/recipe-book.storage.js`. Si en el futuro se migra a Cloud Storage (Estrategia B al activar Blaze), solo se sustituye la implementación interna de dicho archivo sin alterar servicios, controladores ni modelos.

---

## 5. Modelo de Datos y Seguridad (Firestore)

### Estructura del Documento (`recipeBooks/{id}`)

```json
{
  "id": "UUID generado (clave del documento)",
  "courseId": "UUID del curso al que pertenece",
  "title": "Título descriptivo del recetario",
  "fileName": "Nombre saneado del archivo (con extensión .pdf)",
  "contentType": "application/pdf",
  "sizeBytes": 1048576,
  "createdBy": "UID del administrador que subió el archivo",
  "createdAt": "Timestamp de Firestore",
  "updatedAt": "Timestamp de Firestore"
}
```

- **Respuesta pública de la API (`RecipeBook`):** Devuelve `id, courseId, title, fileName, contentType, sizeBytes, createdAt, updatedAt` (fechas en formato ISO 8601). El campo `createdBy` es estrictamente interno y nunca se expone en las respuestas de la API.
- **Sin migraciones ni índices compuestos:** Al tratarse de una colección nueva, no se requieren migraciones. Las consultas filtran por igualdad (`where("courseId", "==", courseId)`) y el ordenamiento temporal descendente se efectúa en memoria, evitando requerir índices compuestos en Firestore.
- **NOTA PARA EL HUMANO (Reglas de Seguridad de Firestore):**
  Es necesario configurar en la consola de Firebase / `firestore.rules` que se deniegue todo acceso directo de clientes a la colección `recipeBooks` y sus subcolecciones:
  ```
  match /recipeBooks/{recipeBookId}/{document=**} {
    allow read, write: if false;
  }
  ```
  Toda operación legítima se canaliza a través de `apps/api` utilizando Firebase Admin SDK, el cual no está restringido por estas reglas.

