# HU-T05 — Configuración pública de WhatsApp

CIU-154 expone la configuración del contacto y CIU-158 verifica el backend.
No se implementan botones, enlaces `wa.me`, envíos, compras ni integración con WhatsApp Business.

## Configuración del servidor

Configurar estas variables en el entorno del proceso API o en `apps/api/.env`, siguiendo
`apps/api/.env.example`. No registrar credenciales ni números reales en el repositorio.

```dotenv
WHATSAPP_CONTACT_PHONE=
WHATSAPP_CONTACT_MESSAGE_TEMPLATE=
```

El servicio lee las variables actuales en cada solicitud, sin caché ni acceso a Firebase.
Los cambios en un archivo `.env` requieren reiniciar el proceso para que dotenv los cargue;
editar el archivo no modifica por sí solo el entorno de un proceso en ejecución.
El número y la plantilla se configuran independientemente.

### Número

Se recortan espacios exteriores con `trim()`. Ausente, vacío o solo espacios significa
contacto no configurado, incluso si existe una plantilla (que en ese caso no se valida).
Un valor proporcionado debe cumplir `^\+[1-9][0-9]{0,14}$`: signo `+`, de 1 a 15 dígitos
ASCII y primer dígito distinto de cero. Es validación estructural E.164, sin restricción
permanente a Costa Rica y sin comprobar asignación del número o existencia de una cuenta.
No se agregan prefijos ni se eliminan separadores. Se rechazan espacios internos, letras,
guiones, paréntesis, corchetes, signos adicionales y otros caracteres.

### Plantilla

Se recortan espacios exteriores; se preservan espacios internos, saltos de línea, acentos
y Unicode. Una variable ausente, vacía o solo espacios utiliza exactamente:

```text
Hola, quisiera información sobre {{productName}}.
```

Este texto es un **fallback técnico provisional**, no una afirmación comercial aprobada.
Una plantilla personalizada debe contener el marcador exacto `{{productName}}` y no superar
1000 puntos de código Unicode después de `trim()`. Una plantilla que incumpla devuelve 500.
La plantilla es texto plano: no se ejecuta código, interpreta HTML ni sustituye el marcador.

## Contrato HTTP

`GET /api/contact/whatsapp` es público: no requiere Authorization, verificación de alumnos
ni permisos administrativos. No lee ni escribe en Firestore.

```bash
curl http://localhost:3000/api/contact/whatsapp
```

- **200:** objeto con exactamente `phone` y `messageTemplate`; número configurado con su
  `+` y plantilla resuelta, ambos normalizados según las reglas anteriores. No se entrega URL.
  El siguiente ejemplo es esquemático: `+506XXXXXXXX` no es un número válido ni confirmado.

  ```json
  {"phone":"+506XXXXXXXX","messageTemplate":"Hola, quisiera información sobre {{productName}}."}
  ```

- **404:** `{"message":"WhatsApp contact is not configured."}` cuando falta el número.
- **500:** `{"message":"WhatsApp contact configuration is invalid."}` cuando el número o
  la plantilla configurados son inválidos. No se devuelve ni registra el valor inválido,
  nombres internos de variables ni detalles de excepciones.

## Integración futura y decisiones pendientes

- CIU-129 registra que se usa el mismo número de la Academia; no proporciona un valor
  real confirmado para esta configuración. Las referencias preexistentes en otras pantallas
  no se toman como confirmación de este contrato.
- El teléfono oficial y el mensaje aprobado siguen pendientes bajo **CIU-152**. Este lote
  no resuelve esa confirmación. El entorno de despliegue debe recibir el número confirmado;
  dejarlo vacío mantiene la respuesta 404 y evita inventar un contacto.
- La UI pertenece a **CIU-155/CIU-156**. El frontend sustituirá literalmente `{{productName}}`
  por el nombre del producto seleccionado y deberá URL-encodear el mensaje para abrir WhatsApp.
  Debe tratarlo como texto plano, sin renderizar HTML. No debe esperar una URL del backend.
- HU-T05 **no queda completa** por existir este endpoint. Este lote implementa únicamente
  CIU-154 y CIU-158; no debe marcarse la historia ni otras tareas como completadas.
