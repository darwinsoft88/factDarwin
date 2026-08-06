# Etapa 3.4: aplicación incremental piloto de clientes y productos

## Alcance

Únicamente `clients` y `products`. Ventas, inventario, cartera, documentos SRI, usuarios, configuración e históricos continúan con snapshot completo. El outbox conserva FIFO, idempotencia y persistencia existentes.

## Flags

Backend, apagado por defecto:

```env
INCREMENTAL_SYNC_ENABLED=false
INCREMENTAL_SYNC_MODE=off
INCREMENTAL_SYNC_CONFIG_VERSION=1
INCREMENTAL_SYNC_COMPANY_IDS=
INCREMENTAL_SYNC_PLATFORMS=android
INCREMENTAL_SYNC_PILOT_USER_IDS=
INCREMENTAL_SYNC_PILOT_DEVICE_IDS=
INCREMENTAL_SYNC_CLIENTS_ENABLED=false
INCREMENTAL_SYNC_PRODUCTS_ENABLED=false
INCREMENTAL_SYNC_BATCH_LIMIT=100
INCREMENTAL_SYNC_MAX_RESPONSE_BYTES=2097152
INCREMENTAL_SYNC_MIN_APP_VERSION=1.0.11
INCREMENTAL_SYNC_CURSOR_SECRET=
```

Shadow usa `INCREMENTAL_SYNC_SHADOW_MODE=shadow`; conserva compatibilidad usando `INCREMENTAL_SYNC_MODE` como fallback. Cliente Android: `EXPO_PUBLIC_INCREMENTAL_SYNC_PILOT=1`. PWA nunca habilita el piloto.

## Handshake y rutas

- `GET /api/sync/capabilities`: informa protocolo 1, módulos y fallback.
- `GET /api/sync/bootstrap`: snapshot y watermark obtenidos en una transacción PostgreSQL `REPEATABLE READ READ ONLY`, cursor situado exactamente en ese watermark y ledger de versiones de clientes/productos.
- `GET /api/sync/pull`: exige cursor de bootstrap; comparte firma, límites y watermark del protocolo aprobado.

Headers: `X-Sync-Protocol-Version`, `X-App-Version`, `X-Platform`, `X-Device-Id`. Empresa y usuario proceden del JWT. El dispositivo debe existir en `saas_devices`; el cliente genera una identidad criptográfica durable y la registra durante login/registro.

## Orden y atomicidad

1. Verificar conectividad y flags.
2. El flujo existente empuja outbox FIFO.
3. Si queda cualquier pendiente, bloquear pull y conservar cursor.
4. Bootstrap si no existe cursor compatible.
5. Validar lote completo: cursor, protocolo, orden, tipo, campos, hash y versiones.
6. Aplicar a una copia de `AppData`.
7. Confirmar mediante `updateStoredData`, que escribe temporal, verifica y reemplaza el archivo canónico.
8. Los coordinadores existentes actualizan SQLite después de confirmar el archivo.
9. Guardar cursor y ledger durable en AsyncStorage separado del outbox.

Si el proceso muere después del archivo y antes del cursor, el lote se repite. Los hashes y versiones lo hacen idempotente. Si SQLite falla, el archivo sigue válido, los recibos quedan dirty y el espejo se reconstruye; el cursor puede avanzar porque SQLite no es autoridad.

## Conflictos

- Pendiente local sobre la entidad: pull bloqueado antes de sobrescribir.
- Misma versión y mismo hash: repetición idempotente.
- Misma versión y hash distinto: conflicto, lote abortado.
- Versión menor: ignorada sin resurrección.
- Salto de versión: lote abortado y cursor intacto.
- Hash incorrecto, orden inválido o tipo no permitido: lote abortado.
- No se usa last-write-wins por fecha.

## Tombstones

Exigen `DELETE`, `isTombstone=true`, `payload=null` y versión consecutiva. Se retiran del catálogo y su ID queda en `deletedIds`; ventas e históricos permanecen intactos. El ledger conserva la versión del tombstone e impide que un UPSERT antiguo resurja la entidad.

## Fallback y rollback

Ante cursor inválido/expirado, hash, salto, lote inconsistente o estado local corrupto se conserva outbox y se usa el snapshot completo existente. Apagar cualquier flag detiene nuevas llamadas incrementales sin reinstalar ni borrar cursores. Una configuración incompatible obliga a bootstrap nuevo.

## Observabilidad

Eventos seguros `sync_incremental_*` registran inicio, final, error, cambios, módulos, tombstones, cursor, conflictos, hash, saltos, fallback, bloqueo por outbox, duración y bytes. No incluyen payload, cursor, XML, token ni información personal.

## Riesgos pendientes

- La prueba física Android y mediciones en dispositivo real deben completarse antes de aprobación definitiva.
- El rate limiting del pull permanece local por proceso, igual que en 3.3.
- Solo los catálogos piloto tienen ledger local; habilitar otro módulo requiere nueva versión de configuración y bootstrap.
