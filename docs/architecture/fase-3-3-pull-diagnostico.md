# Etapa 3.3: contrato pull incremental diagnóstico

> Este endpoint no implica que el cliente aplique cambios ni que la sincronización incremental esté activada.

## Ruta y autorización

`GET /api/sync/diagnostic/pull` requiere JWT válido y rol `admin`. `companyId` se obtiene exclusivamente del token. La ruta está apagada por defecto y responde `SYNC_PULL_DISABLED` cuando no cumple configuración, ambiente o allowlist.

Parámetros:

- `cursor`: cursor opaco opcional, máximo 2.048 caracteres por defecto.
- `limit`: entero entre 1 y 500; predeterminado 100.
- `modules`: no soportado en protocolo 1 (`SYNC_MODULE_FILTER_UNSUPPORTED`). Un filtro con cursor global podría omitir definitivamente módulos no solicitados.

## Configuración

```env
INCREMENTAL_SYNC_PULL_DIAGNOSTIC_ENABLED=false
INCREMENTAL_SYNC_PULL_MODE=off
INCREMENTAL_SYNC_PULL_CONFIG_VERSION=1
INCREMENTAL_SYNC_PULL_ENVIRONMENT=production
INCREMENTAL_SYNC_PULL_COMPANY_IDS=
INCREMENTAL_SYNC_PULL_CURSOR_SECRET=
INCREMENTAL_SYNC_PULL_DEFAULT_LIMIT=100
INCREMENTAL_SYNC_PULL_MAX_LIMIT=500
INCREMENTAL_SYNC_PULL_MAX_RESPONSE_BYTES=2097152
INCREMENTAL_SYNC_PULL_MAX_CURSOR_LENGTH=2048
INCREMENTAL_SYNC_PULL_RATE_LIMIT_PER_MINUTE=30
INCREMENTAL_SYNC_PULL_TIMEOUT_MS=5000
INCREMENTAL_SYNC_PULL_MIN_AVAILABLE_SEQUENCE=0
```

Staging y producción siempre exigen allowlist. Shadow logging y pull diagnóstico tienen flags independientes. Se recomienda un secreto aleatorio exclusivo de al menos 32 bytes; si falta, se deriva criptográficamente de `JWT_SECRET` con etiqueta específica.

## Cursor y consistencia

El cursor contiene internamente versión de protocolo, empresa, última secuencia incluida, watermark, revisión, fecha de emisión y versión de configuración. Se serializa base64url y se firma con HMAC-SHA256. La firma se compara en tiempo constante.

Sin cursor se inicia una sesión diagnóstica desde 0 y se fija `watermark = MAX(change_seq)` de esa empresa. Todas las páginas usan:

```sql
WHERE company_id = $1
  AND change_seq > $2
  AND change_seq <= $3
ORDER BY change_seq ASC
LIMIT $4
```

Cambios concurrentes posteriores al watermark no aparecen a mitad de la sesión; aparecen en una nueva sesión. Así una sesión ofrece un conjunto cerrado, ordenado y repetible. Este inicio desde cero es exclusivamente diagnóstico y no define el futuro bootstrap productivo.

## Respuesta

```json
{
  "ok": true,
  "protocolVersion": 1,
  "mode": "diagnostic",
  "fromCursor": "opaco",
  "nextCursor": "opaco",
  "hasMore": true,
  "changeCount": 100,
  "snapshotRevision": 3801,
  "changes": [{
    "sequence": 84522,
    "module": "clients",
    "entityType": "client",
    "entityId": "client-1",
    "action": "UPSERT",
    "recordVersion": 7,
    "payloadHash": "sha256",
    "payload": {},
    "origin": "incremental_merge",
    "occurredAt": "2026-07-31T00:00:00.000Z",
    "isTombstone": false
  }]
}
```

Los campos permiten ordenar, identificar, verificar versión/hash y diagnosticar origen. No se exponen `transaction_id`, `request_id`, `operation_id`, credenciales ni tokens. Usuarios se sanitizan nuevamente al responder. Un `DELETE` lleva `payload: null` e `isTombstone: true`.

El máximo de bytes se aplica a la respuesta JSON completa. Si una sola fila no cabe se responde `SYNC_PULL_RESPONSE_TOO_LARGE`; el cursor nunca avanza sobre una fila no entregada.

## Errores

| Código | HTTP | Significado |
|---|---:|---|
| `SYNC_PULL_DISABLED` | 404 | Flag, modo, ambiente, versión o empresa rechazados |
| `SYNC_PULL_RATE_LIMITED` | 429 | Límite por empresa y usuario |
| `SYNC_PULL_INVALID_LIMIT` | 400 | Límite inválido |
| `SYNC_MODULE_FILTER_UNSUPPORTED` | 400 | Filtro inseguro en protocolo 1 |
| `SYNC_CURSOR_INVALID` | 400/409 | Malformado, firma o configuración incompatible |
| `SYNC_CURSOR_COMPANY_MISMATCH` | 403 | Cursor de otra empresa |
| `SYNC_CURSOR_PROTOCOL_UNSUPPORTED` | 409 | Protocolo desconocido |
| `SYNC_CURSOR_FUTURE` | 409 | Secuencia/watermark futuro |
| `SYNC_CURSOR_EXPIRED` | 410 | Anterior al mínimo retenido; `requiresFullSnapshot: true` |
| `SYNC_PULL_RESPONSE_TOO_LARGE` | 413 | Una fila excede el máximo de respuesta |

## Garantías y límites

- Pull de solo lectura: no marca leído ni guarda cursor.
- Repetir cursor y límite produce las mismas secuencias y el mismo `nextCursor` mientras se retengan filas.
- No toca snapshot, outbox, tombstones, SQLite ni clientes.
- No hay limpieza en esta etapa; `MIN_AVAILABLE_SEQUENCE` solo permite probar expiración.
- Rate limiting es local por proceso. Un despliegue con varias réplicas necesitará un limitador compartido antes de cualquier habilitación amplia.

## Rollback

Configurar `INCREMENTAL_SYNC_PULL_DIAGNOSTIC_ENABLED=false` o modo `off`. Se conservan change log, shadow logging, snapshots, endpoints actuales y outbox; no requiere migración inversa.
