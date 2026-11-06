# HU-A07 — Consulta de Estado de Pago de Matrículas (Enrollment Payment Status)

Este documento define las reglas de negocio, decisiones de diseño técnico, modelo de datos y preguntas abiertas para la gestión y consulta del estado de pago de matrículas en Ciudad Pastel.

---

## 1. Tabla de Decisiones y Reglas de Estado de Pago

| # | Decisión / Regla | Detalle Técnico y Operativo | Estado |
|---|---|---|---|
| 1 | **Estados de pago definidos (`PAYMENT_STATUS`)** | Se definen tres estados únicos: `pending` (sin pago registrado), `deposit_paid` (adelanto recibido, espacio apartado) y `paid` (pago completo confirmado). La API almacena y responde exclusivamente estas claves en inglés; el frontend es el encargado de presentar los textos en español al estudiante. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 2 | **Actualización por personal autorizado** | Solo el personal administrativo con rol verificado puede modificar el estado de pago mediante la ruta protegida (`PATCH /api/admin/enrollments/:id/payment-status`). Se puede alternar entre cualquiera de los 3 valores en cualquier momento para permitir corregir errores operativos. Se registran atómicamente `paymentUpdatedAt` (marca de tiempo en formato ISO) y `paymentUpdatedBy` (UID del usuario administrador autenticado). No se conserva historial de cambios anteriores. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 3 | **Compatibilidad con matrículas preexistentes** | Las matrículas ya registradas en Firestore que no cuenten con el campo `paymentStatus` se interpretan automáticamente como `pending` en el mapper del repositorio. No se requiere ejecutar ningún script de migración masiva de datos en la base de datos. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 4 | **Exclusión de pasarela de pago en línea (EX-01)** | El sistema no procesa pagos con tarjeta ni se conecta a pasarelas electrónicas. El pago se coordina por medios externos (SINPE Móvil, transferencia o en el taller). La plataforma únicamente registra administrativamente y permite consultar el estado del pago. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 5 | **Consulta privada del estudiante mediante POST** | La consulta pública se ejecuta mediante `POST /api/enrollments/payment-status` enviando `{ nationalId, phone }` en el cuerpo (nunca en parámetros de consulta de la URL para evitar registros en historiales o logs). Se normalizan ambos campos antes de consultar. Si hay coincidencias, retorna 200 con `{ enrollments: [{ courseName, paymentStatus, paymentUpdatedAt }] }`. Si no hay coincidencias o no existe la persona, responde idénticamente 200 con `{ enrollments: [] }` para no revelar la existencia de estudiantes registrados. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 6 | **Protección contra fuerza bruta (Límite de intentos)** | Al ser un endpoint público que maneja datos personales, se restringe a un máximo de 10 intentos por dirección IP cada 10 minutos. Al superar este umbral, responde `429 Too Many Requests` con `{ "message": "Too many attempts. Try again later." }`. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 7 | **Privacidad y confidencialidad estricta** | El número de cédula y el número de teléfono nunca se devuelven en el cuerpo de las respuestas de la consulta de pago, ni se imprimen en logs de depuración (`console.log`, `console.error`) ni en mensajes de error. | PROPUESTA — falta confirmar con Ciudad Pastel |
| 8 | **Convención uniforme de errores** | Se mantiene la convención de la API: errores de validación responden `400` (`ValidationError`), registros no encontrados responden `404` (`NotFoundError`), exceso de intentos responde `429`, y fallos de infraestructura responden `500` con `{ message }` sin exponer detalles internos ni trazas de ejecución. | PROPUESTA — falta confirmar con Ciudad Pastel |

---

## 2. Preguntas para la Clienta (Ciudad Pastel)

Estas preguntas deben realizarse a la clienta en lenguaje sencillo para validar las reglas antes de la puesta en producción:

1. **Estados de pago en la operación real:** ¿Qué estados de pago manejan actualmente en su libreta o control diario? ¿Les resulta suficiente clasificar en *Sin pago*, *Adelanto recibido* y *Pago completo*, o manejan algún otro estado intermedio?
2. **Cancelaciones y devoluciones:** ¿Qué sucede si una persona cancela su participación o solicita una devolución de dinero? ¿Debe existir un estado de pago especial o la matrícula simplemente se marca como cancelada?
3. **Quién y cuándo actualiza:** ¿Quiénes en Ciudad Pastel se encargan de revisar los comprobantes de pago y en qué momentos actualizan el estado de la matrícula?
4. **Mensajes visibles para el estudiante:** ¿Qué mensaje claro y tranquilizador les gustaría que vea el estudiante cuando consulte en la página web según cada estado?
   - Por ejemplo:
     - *Sin pago:* "Aún no hemos registrado su pago. Recuerde coordinar su comprobante con nosotras."
     - *Adelanto:* "Hemos recibido su adelanto. Su espacio para el curso se encuentra debidamente apartado."
     - *Pago completo:* "Pago completo recibido. Su matrícula está 100% confirmada."
5. **Identificación para consulta:** ¿Les parece bien y seguro que el estudiante consulte su estado ingresando únicamente su número de cédula y su número de teléfono?
6. **Monto y medios de pago para adelantos:** ¿De qué porcentaje o monto suele ser el adelanto mínimo para apartar el cupo (por ejemplo 50%), y cuáles medios de pago aceptan (SINPE Móvil, transferencia IBAN, pago en efectivo)? *(Recordar que la página web no cobra dinero, sino que el pago se coordina directamente con ustedes).*

---

## 3. Respuestas de Ciudad Pastel

*(Sección vacía — pendiente de registrar las respuestas obtenidas por el equipo tras consultar a la clienta).*
