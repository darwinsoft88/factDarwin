# ADR-001: Cola durable para correos de documentos autorizados

- Estado: aceptado; Fase 1 implementada
- Fecha: 2026-07-26
- Alcance inicial: facturas y notas de crédito
- Propietario: backend de factuDarwin

## Contexto

factuDarwin debe enviar automáticamente por correo los documentos tributarios
cuando el SRI los autoriza. También debe conservar el botón Email para que el
usuario pueda reenviar voluntariamente un documento.

Un envío de correo combina sistemas con garantías distintas:

- El SRI determina el estado tributario del documento.
- PostgreSQL conserva el documento y la intención de enviar.
- El servidor de correo acepta o rechaza el mensaje.
- El destinatario puede recibirlo más tarde o no recibirlo.
- El frontend puede cerrarse, perder conexión, quedar desactualizado o repetir
  una petición.

Acoplar directamente estos pasos permitiría perder correos, enviarlos dos veces
o, peor aún, alterar el estado tributario por un problema ajeno al SRI.

## Decisión

Se utiliza una cola durable en PostgreSQL denominada
`document_email_operations`. La transición del documento y la creación de la
operación automática se confirman en la misma transacción de
`/api/sync/merge`.

La Fase 1 solamente registra operaciones. El feature flag permanece en `off`;
todavía no existe trabajador y no se llama a SMTP.

## Por qué se creó una cola

El correo no forma parte atómica de una transacción PostgreSQL. Aunque el
servidor SMTP acepte un mensaje, la base podría fallar antes de registrar el
resultado; también podría ocurrir lo contrario.

La cola aplica el patrón de salida transaccional:

1. Se persiste el documento.
2. En la misma transacción se registra la intención durable de enviar.
3. Un trabajador independiente reclamará y procesará esa intención.

Así, una caída del servidor no borra la intención de envío. Los reintentos,
errores y resultados permanecen auditables y no dependen de que una pantalla
continúe abierta.

## Por qué solo se dispara al pasar a `AUTORIZADA`

Un documento pendiente, devuelto o rechazado todavía no constituye un
comprobante definitivamente autorizado por el SRI. Enviar automáticamente en
esos estados podría entregar al cliente un documento que después cambie o que
nunca adquiera validez tributaria.

La condición se calcula sobre datos durables:

```text
estado anterior en currentData != AUTORIZADA
estado final fusionado en finalData == AUTORIZADA
```

No se inspecciona únicamente el patch recibido. El patch puede ser parcial y no
representar el estado completo que finalmente se almacenará. Esta comparación
produce el mismo resultado tanto para la emisión inicial como para reintentos
manuales o automáticos de autorización.

Si el documento ya estaba autorizado, otro merge no crea una nueva operación
automática.

## Por qué no depende del frontend

El frontend no es una fuente confiable para un efecto durable:

- Puede cerrarse inmediatamente después de autorizar.
- Puede perder la respuesta por timeout.
- Pueden coexistir versiones antiguas y nuevas.
- Android, iOS y web tienen ciclos de vida distintos.
- Un usuario puede pulsar varias veces o abrir la cuenta en varios dispositivos.

La fuente de verdad es el backend, exactamente en el punto donde persiste la
transición durable. Por eso cualquier vía que termine autorizando el mismo
documento genera la misma operación, aunque no exista una pantalla abierta.

## `automatic_authorization` y `manual_resend`

El campo `origin` distingue dos intenciones distintas:

- `automatic_authorization`: primer envío generado por la transición a
  `AUTORIZADA`. Debe existir como máximo uno por documento y empresa.
- `manual_resend`: reenvío solicitado expresamente mediante el botón Email.
  Puede ocurrir varias veces y no consume, sustituye ni bloquea la operación
  automática.

Esta separación permite auditar quién o qué originó cada correo, aplicar reglas
de idempotencia distintas y mantener disponible el reenvío manual.

Un envío manual nunca debe cambiar el estado SRI ni marcar como procesada una
operación automática.

## Idempotencia

La identidad lógica del primer envío automático es:

```text
company_id + document_type + document_id + origin
```

PostgreSQL la protege con el índice único parcial
`uq_document_email_automatic`, aplicable a
`origin = 'automatic_authorization'`. La inserción utiliza `ON CONFLICT DO
NOTHING`.

Además, el ID de la operación se deriva de forma determinística de esa misma
identidad. Los reintentos secuenciales, las peticiones repetidas y dos procesos
concurrentes convergen en una sola fila.

La idempotencia de un reenvío manual es independiente. No debe reutilizar la
clave única del envío automático.

## Por qué la clave incluye `document_type`

No se presupone que `document_id` será globalmente único entre todos los tipos
tributarios actuales y futuros. Una factura y una nota de crédito pueden tener
identidades de negocio diferentes aunque compartan el mismo valor técnico de
ID.

Incluir `document_type`:

- Evita que tipos distintos colisionen.
- Permite agregar nuevos documentos tributarios sin rediseñar la clave.
- Conserva la intención exacta que deberá renderizar el trabajador.

La Fase 1 admite únicamente `factura` y `nota_credito`. Proformas y tickets no
crean operaciones.

## Por qué se eligió `FOR UPDATE SKIP LOCKED`

Esta decisión pertenece al diseño del trabajador de una fase posterior; la
Fase 1 todavía no procesa la cola.

El trabajador reclamará filas elegibles dentro de una transacción mediante
`FOR UPDATE SKIP LOCKED`. Esta combinación permite que varios procesos trabajen
en paralelo:

- `FOR UPDATE` entrega la propiedad temporal de una fila a un solo proceso.
- `SKIP LOCKED` hace que los demás procesos continúen con otras filas, en lugar
  de esperar o reclamar la misma operación.

Al reclamarla, el trabajador cambiará la operación de `pending` a `processing`
y registrará un lease. Si el proceso cae, el vencimiento del lease permitirá
recuperarla. El índice único evita crear otra intención; el bloqueo evita que
dos trabajadores procesen simultáneamente la misma fila.

`SKIP LOCKED` no sustituye la idempotencia SMTP. Cuando se implemente el envío,
el trabajador deberá conservar una clave estable por operación ante timeouts o
respuestas perdidas.

## Por qué el estado tributario nunca depende del correo

La autorización es un hecho emitido por el SRI. El correo es únicamente un
canal de notificación posterior. Un destinatario inválido, un timeout o un
rechazo SMTP no puede deshacer ni degradar ese hecho.

Por esta razón:

- Una operación de correo puede quedar `pending`, `processing`, `accepted` o
  `failed`.
- El documento permanece `AUTORIZADA` aunque el correo falle.
- El trabajador nunca escribirá el estado tributario.
- Un reenvío manual tampoco modifica la autorización.

Confundir ambos estados produciría inconsistencias contables y podría provocar
reintentos tributarios innecesarios de documentos que el SRI ya autorizó.

## Datos incompletos

Si en el momento de autorización falta correo válido, cliente, emisor, XML
autorizado o información necesaria para el RIDE, la transición no se pierde.
Se crea una operación `failed` con:

- Snapshot del momento de autorización.
- Destinatario disponible en ese momento.
- Lista de datos faltantes.
- Código y detalle del error.

La autorización permanece intacta. Una fase posterior podrá corregir solamente
el destinatario o reactivar la misma operación, sin crear un segundo primer
envío automático.

## Flujo resumido

```text
/api/sync/merge
  ├─ bloquea y lee currentData
  ├─ aplica el patch y obtiene finalData
  ├─ valida y persiste el snapshot
  ├─ detecta transición durable a AUTORIZADA
  ├─ inserta operación automática idempotente
  └─ COMMIT conjunto

Trabajador futuro
  ├─ reclama con FOR UPDATE SKIP LOCKED
  ├─ prepara XML/RIDE/correo
  ├─ solicita aceptación SMTP
  └─ registra accepted o failed
```

Si cualquier paso previo al `COMMIT` falla, se revierten tanto el snapshot como
la operación. Una vez confirmado el estado tributario, los fallos posteriores
del correo se registran solamente en la cola.

## Invariantes que futuras fases deben conservar

1. Nunca crear envío automático para un documento cuyo estado final no sea
   `AUTORIZADA`.
2. Crear como máximo un `automatic_authorization` por empresa, tipo y
   documento.
3. No enviar SMTP dentro de la transacción de `/api/sync/merge`.
4. No permitir que el correo modifique el estado tributario.
5. Mantener el botón Email como reenvío manual independiente.
6. No afirmar entrega al destinatario cuando SMTP solamente confirmó
   aceptación.
7. Mantener auditables las operaciones con datos incompletos.
8. Activar el trabajador gradualmente mediante feature flags.

## Fase 2: trabajador en simulación

La Fase 2 incorpora un trabajador backend, pero todavía no permite enviar
correo. El modo global acepta solamente `off` y `simulate`; cualquier intento
de configurar `send` se convierte en `off`.

No se agregó un estado `simulated`. Una simulación correcta conserva
`status = pending` y registra separadamente:

- `simulated_at`
- `simulation_result`
- `simulation_worker_id`

El reclamo excluye operaciones que ya tienen `simulated_at`. De este modo la
simulación se ejecuta una sola vez, permanece auditable y nunca se confunde con
la aceptación SMTP representada por `accepted`.

Cada proceso utiliza un `workerId` único. Reclama lotes pequeños dentro de una
transacción mediante `FOR UPDATE SKIP LOCKED`, cambia las filas a `processing`,
incrementa `attempts` y registra el lease. La transacción se confirma antes de
validar la operación, por lo que el trabajo simulado no mantiene bloqueos de
PostgreSQL.

El lease inicial dura diez minutos. Otro ciclo recupera operaciones abandonadas
con `PROCESSING_LEASE_EXPIRED`, limpia el propietario y permite reintento
mientras `attempts < max_attempts`.

La espera después de un error temporal depende del intento:

```text
1: 1 minuto
2: 5 minutos
3: 15 minutos
4: 1 hora
5: 6 horas
```

Los datos estructurales ausentes no alteran el documento tributario ni crean
otra operación. La misma fila pasa a `failed`, conserva su ID y registra el
código específico. Los logs enmascaran el destinatario y nunca incluyen el XML.

El trabajador arranca y se detiene con el backend. Un merge puede despertarlo,
pero nunca procesa la cola dentro de la petición HTTP.

## Fase 3: construcción integral sin envío

La Fase 3 mantiene los únicos modos globales `off` y `simulate`. Después del
reclamo, el trabajador construye completamente en memoria el mensaje, el XML
autorizado y el RIDE PDF. No importa el servicio SMTP ni ejecuta transporte.

El XML procede exclusivamente de
`payload_json.authorizationSnapshot.document.authorizedXml`. No se reconstruye
desde el snapshot, no se usa el XML firmado y no se aceptan rutas de archivos.
Además de validar su estructura y tamaño, se comprueba la clave de acceso
esperada y, cuando existe `codDoc`, el tipo tributario.

El RIDE se genera en backend como `Buffer` PDF mediante un renderizador puro de
datos tributarios. No depende de React Native, `expo-print`, navegador ni
archivos temporales. Factura y nota de crédito comparten cálculos, validaciones
y representación de detalle; la nota de crédito agrega el documento
modificado, su fecha y el motivo.

Una construcción correcta conserva:

```text
status = pending
simulation_result.resultCode = EMAIL_BUILD_VALIDATED
accepted_at = null
```

`simulation_result` contiene solamente asunto, destinatario enmascarado,
nombres, tamaños y hashes de adjuntos. No guarda PDF, XML, HTML, texto ni correo
completo.

No se añadió migración 003 porque los campos de simulación de la Fase 2 son
suficientes.

Los límites iniciales son:

```text
XML: 5 MB
PDF: 10 MB
adjuntos totales: 15 MB
HTML: 500 KB
```

Los errores de destinatario, inyección de encabezados, tipo no soportado,
inconsistencia XML, clave diferente, datos RIDE incompletos y tamaño excesivo
son permanentes. `RIDE_GENERATION_FAILED` y `TECHNICAL_TEMPORARY_ERROR` pueden
reintentarse con la política de la Fase 2.

`AUTHORIZED_XML_MISSING` es permanente en esta arquitectura: la operación
conserva el snapshot inmutable del momento de autorización y actualmente no
existe un flujo que reemplace posteriormente ese XML dentro de la misma
operación. Cuando se implemente una corrección durable del snapshot de la
operación, esa decisión deberá revisarse sin crear un nuevo ID.

## Consecuencias

La solución añade una tabla, estados operativos y un futuro proceso trabajador,
pero obtiene durabilidad, concurrencia segura, auditoría e independencia del
frontend.

La entrega definitiva al buzón no puede garantizarse solamente con la
aceptación SMTP. El estado `accepted` significará que el servidor de correo
aceptó el mensaje, no que el destinatario lo leyó o recibió definitivamente.
