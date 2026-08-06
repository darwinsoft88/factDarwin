# Fase 3.5C — Validación del historial paginado de Documentos

Fecha de validación: 2026-08-01  
PostgreSQL: 18.3 x86_64 Windows  
Decisión: **ETAPA 3.5C APROBADA CON OBSERVACIONES**

## Alcance y archivos auditados

- `backend/src/migrations/005-document-history-index.sql`
- `backend/src/document-history-config.js`
- `backend/src/document-history.js`
- `backend/src/db-postgres.js`
- `backend/src/config.js`
- `backend/src/server.js`
- `backend/src/__tests__/document-history-config.test.js`
- `backend/src/__tests__/document-history.test.js`
- `backend/src/__tests__/postgres-document-history-phase35c.integration.js`

No se modificaron frontend, Android, PWA, SQLite, snapshot local, outbox, emisión, firma, SRI, inventario, cartera, XML, RIDE ni correo.

## Defectos de 3.5B encontrados y corregidos

1. La actualización de la proyección ocultaba todas las filas de una empresa antes de reinsertar lo aún presente en el snapshot compacto. Una factura histórica ausente por compactación podía desaparecer del historial. Ahora solo se ocultan documentos presentes que dejaron de ser elegibles; los ausentes por compactación se conservan.
2. El máximo podía configurarse hasta 200. El protocolo queda limitado rígidamente a 100.
3. No existía detección defensiva de identidades duplicadas en una página. Ahora se rechaza con `HISTORICAL_DOCUMENTS_DUPLICATE_DETECTED` y se registra únicamente un hash corto del ID.
4. Los rechazos de acceso devolvían un código genérico. Ahora se diferencian `FEATURE_DISABLED`, `COMPANY_NOT_ALLOWED`, `PLATFORM_NOT_ALLOWED`, `PROTOCOL_UNSUPPORTED`, `APP_VERSION_NOT_ALLOWED`, `DEVICE_NOT_ALLOWED` y `USER_NOT_ALLOWED`.
5. Faltaba un índice exacto para secuencial. Se agregó `idx_document_history_exact_sequence`.

## Esquema validado

`document_history_index` utiliza `history_seq BIGSERIAL` como clave primaria. La identidad lógica tiene restricción única por:

```text
company_id + document_type + document_id
```

Los importes se almacenan como `BIGINT` escalado en micros. La tabla no almacena XML, PDF, líneas, pagos detallados ni adjuntos. Solo conserva metadatos resumidos y booleanos de disponibilidad.

Índices verificados:

- clave primaria por `history_seq`;
- identidad única por empresa, tipo y documento;
- página keyset por empresa, tipo, estado, scope, fecha, secuencial numérico e ID;
- watermark por empresa e `history_seq`;
- clave de acceso exacta;
- identificación exacta;
- secuencial exacto.

## Elegibilidad y ciclo de vida

La versión 1 incluye únicamente facturas persistidas con estado `AUTORIZADA`, tipo `factura` y sin `inventoryState = RECONCILIATION_PENDING`.

Quedan fuera notas de crédito, proformas, documentos internos, guías, borradores, firmadas, pendientes, errores SRI, rechazadas, anuladas y reconciliaciones pendientes.

Política validada:

- al entrar por primera vez se asigna `history_seq`;
- una actualización del resumen conserva `history_seq`;
- si un documento presente deja de ser elegible, queda `is_visible = false`;
- si vuelve a ser elegible, recupera la misma fila y secuencia;
- una ausencia causada por compactación no se interpreta como eliminación;
- no existe borrado automático del índice.

El backend no puede conocer un outbox que todavía reside exclusivamente en un dispositivo desconectado. “Sin operación local pendiente conocida” significa pendiente ya reflejado por el estado durable del servidor. Esta limitación no se resuelve tocando el outbox en 3.5C.

## PostgreSQL real

Instancia real configurada:

| Comprobación | Resultado |
| --- | ---: |
| Ventas elegibles | 260 |
| Filas proyectadas visibles | 260 |
| Faltantes | 0 |
| Extras | 0 |
| Tipo/estado inválido | 0 |
| `history_seq` únicos | 260 |
| Identidades únicas | 260 |
| Rango de secuencia | 1–260 |

Tamaño real con 260 filas: tabla 204.800 bytes, índices 344.064 bytes, total 589.824 bytes.

## Backfill aislado e idempotencia

Se creó una base aislada y posteriormente se eliminó. Se evaluaron 1.279 documentos: 1.250 facturas elegibles de una empresa, 25 de otra y 4 documentos excluidos.

| Ejecución | Filas finales | Duración |
| --- | ---: | ---: |
| Inicial | 1.275 | 48 ms |
| Repetida | 1.275 | 52 ms |

La segunda ejecución conservó todas las secuencias. La unicidad fue total y una corrupción provocada dentro de una transacción fue detectada; el rollback dejó cero filas parciales.

## Cursor, orden y watermark

El cursor está firmado con HMAC y ligado a protocolo, configuración, empresa, filtros normalizados, watermark, clave keyset e instante de emisión. Se probaron firma manipulada, otra empresa, filtros distintos, configuración incompatible, expiración y longitud superior a 4.096 caracteres.

Orden estable:

```sql
ORDER BY created_at DESC, sequence_number DESC, document_id DESC
```

No se utiliza `OFFSET` ni número de página. Todas las páginas aplican `history_seq <= queryWatermark`.

Con 1.250 documentos:

| Límite | Páginas | Recibidos | Duplicados | Omisiones |
| ---: | ---: | ---: | ---: | ---: |
| 25 | 50 | 1.250 | 0 | 0 |
| 50 | 25 | 1.250 | 0 | 0 |
| 100 | 13 | 1.250 | 0 | 0 |

Una factura insertada después de la primera página, incluso con fecha antigua, quedó fuera de la sesión abierta y apareció en una sesión nueva.

## Rendimiento con 100.000 filas

La inserción sintética controlada tomó 3.770 ms.

| Escenario | Filas devueltas | SQL ms | Índice |
| --- | ---: | ---: | --- |
| Watermark | 1 | 0,017 | Index Scan hacia atrás + LIMIT |
| Primera página | 100 | 0,076 | `idx_document_history_page` |
| Página intermedia | 100 | 0,146 | `idx_document_history_page` |
| Identificación exacta | 1 | 0,028 | `idx_document_history_exact_client_identification` |
| Secuencial exacto | 1 | 0,026 | `idx_document_history_exact_sequence` |

La consulta principal no usa Seq Scan, Aggregate global, Sort masivo ni OFFSET, y se detiene por `LIMIT`.

Almacenamiento para 101.279 filas: tabla 26.853.376 bytes, índices 56.623.104 bytes y total 83.509.248 bytes. Aproximación lineal conservadora:

- 1.000 documentos: 0,84 MB;
- 10.000: 8,35 MB;
- 100.000: 83,5 MB;
- 1.000.000: 835 MB.

## Seguridad, DTO y solo lectura

El `companyId` procede exclusivamente del JWT. El DTO enmascara identificación y autorización; no incluye XML, RIDE, líneas, pagos, payload SRI, correo completo, certificados, secretos, tokens, `transaction_id`, `requestId` ni `operationId`.

Las consultas usan parámetros PostgreSQL. Las lecturas se ejecutan en transacciones `REPEATABLE READ READ ONLY`, con timeout de 10 segundos. Los límites son 50 por defecto, 100 máximo, respuesta máxima de 2 MB, cursor máximo de 4.096 caracteres y 30 solicitudes por minuto por empresa/usuario/dispositivo.

## Observabilidad

Se verificaron eventos de solicitud, finalización, error, elementos, bytes, duración, página vacía, cursor inválido/expirado, duplicado y timeout. No se registra el cursor completo ni datos personales completos. El evento de fallback a snapshot corresponde a una integración cliente futura y no se emite en esta etapa backend sin frontend.

## Rollback

El rollback funcional consiste en mantener o cambiar `HISTORICAL_DOCUMENT_PAGINATION_ENABLED=false`. La proyección puede permanecer intacta e ignorada. No requiere migración inversa, reinstalación, borrado de datos ni cambios al snapshot/outbox.

La configuración predeterminada continúa apagada. No se habilitó ninguna empresa real.

## Pruebas y regresiones

- Jest frontend/SQLite: 55 suites, 366/366 pruebas aprobadas.
- Historial/configuración: 9/9 aprobadas.
- Shadow log, reconciliación, pull y piloto: 24/24 aprobadas.
- Correos relacionados: 25/25 aprobadas.
- Integración PostgreSQL 3.5C: aprobada sin omisiones, duplicados ni reasignación de secuencias.
- Dos archivos backend locales (`domain-operations.test.js` y `sync-operations.test.js`) fallan sobre `backend/src/db.js`, archivo preexistente y ajeno a 3.5C; PostgreSQL/historial no participa en esos fallos.

## Observación pendiente

La prueba HTTP con proceso real no pudo ejecutarse porque el entorno bloqueó `child_process.spawn` con `EPERM`, y la solicitud de ejecución ampliada fue rechazada por límite del entorno. La ruta, autorización y códigos fueron auditados estáticamente, pero deben ejecutarse en CI o en un terminal sin esa restricción antes de declarar aprobación plena.

Debe verificarse allí: JWT inválido, rol, flag apagado, empresa/plataforma/dispositivo/versiones no permitidas, cursor válido/inválido, rate limit y rollback HTTP por flag.

## Riesgos pendientes

1. Pendientes que existen únicamente en un dispositivo offline no son visibles para PostgreSQL hasta que llegan al servidor.
2. La prueba HTTP real queda pendiente por la limitación `spawn EPERM` del entorno actual.
3. La estimación de almacenamiento es lineal y debe reevaluarse con distribución productiva de textos y VACUUM reales.

No se inició la Etapa 3.5D, no se generó APK/AAB y no se creó commit ni tag.
