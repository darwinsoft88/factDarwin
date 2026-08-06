# Etapa 3.2: shadow logging y reconciliación

## Decisión

FactuDarwin registra, dentro de la misma transacción PostgreSQL que modifica el snapshot y sus tablas normalizadas, un cambio inmutable por entidad en `sync_change_log`. En esta etapa el registro no tiene consumidores: no existe endpoint pull, cursor cliente ni cambio de sincronización. El reconciliador es estrictamente de solo lectura.

## Activación y rollback

La activación requiere simultáneamente:

- `INCREMENTAL_SYNC_SHADOW_ENABLED=true`;
- `INCREMENTAL_SYNC_MODE=shadow`;
- `INCREMENTAL_SYNC_CONFIG_VERSION=1`;
- ambiente autorizado en `INCREMENTAL_SYNC_ENVIRONMENT` o `NODE_ENV`;
- empresa incluida en `INCREMENTAL_SYNC_SHADOW_COMPANY_IDS` cuando hay allowlist; en staging y producción la allowlist es obligatoria.

El valor predeterminado es `off`. El rollback operativo consiste únicamente en apagar `INCREMENTAL_SYNC_SHADOW_ENABLED` o usar modo `off`; no borra cambios históricos, snapshots, outbox ni datos normalizados.

## Cobertura de escrituras

| Flujo | Origen | Transacción conjunta |
|---|---|---|
| `POST /api/data` | `legacy_snapshot` | sí |
| `POST /api/sync/merge` sin requestId | `legacy_merge` | sí |
| merge idempotente | `incremental_merge` | sí |
| operación de dominio dentro del merge | `domain_operation` | sí |
| restauración administrativa | `admin_operation` | sí |
| cambio de contraseña | `admin_operation` | sí |
| recuperación de contraseña | `system_operation` | sí |
| alta inicial de empresa | `system_operation` | sí |
| primer registro shadow de una empresa existente | `shadow_baseline` | sí |

La identidad de usuario procede exclusivamente del JWT verificado. `device_id` queda `NULL` salvo que el backend lo conozca de forma confiable durante el registro del dispositivo; nunca se acepta desde el cuerpo del snapshot.

## Versiones, hashes y tombstones

`change_seq` determina el orden global durable. `record_version` aumenta por `company_id + entity_type + entity_id`, incluso si una entidad se elimina y posteriormente se recrea. Los `DELETE` contienen `payload = NULL` e `is_tombstone = true`. El hash SHA-256 usa serialización canónica estable; conserva orden de arrays, `null` y estructuras anidadas, pero no depende del orden de propiedades.

Los payloads de usuarios eliminan recursivamente contraseñas, hashes, tokens, secretos, JWT y autorización. No se registran XML completos en logs técnicos; el change log conserva el payload funcional que ya forma parte del snapshot, sujeto a la política de retención que se definirá antes de habilitar consumidores.

## Reconciliación

`npm run sync-shadow:reconcile -- <companyId>` compara:

1. snapshot canónico;
2. último cambio por entidad en `sync_change_log`;
3. conteos de tablas normalizadas disponibles.

Detecta `MISSING_CHANGE`, `ORPHAN_CHANGE`, `PAYLOAD_HASH_MISMATCH`, `RECORD_VERSION_GAP`, secuencia no monotónica, tombstone inconsistente, divergencia snapshot/log y conteo normalizado diferente. Cartera, retenciones y configuración se reportan `UNAVAILABLE` cuando no existe una tabla normalizada equivalente; no se presentan falsamente como consistentes.

El comando solo ejecuta `SELECT`. Devuelve código 0 si es consistente, 2 si encuentra diferencias y 1 por error técnico. Nunca repara, elimina ni reordena registros.

## Observabilidad

Eventos estructurados:

- `sync_shadow_configuration_decision`;
- `sync_shadow_change_written_total`;
- `sync_shadow_tombstone_total`;
- `sync_shadow_change_failed_total`;
- `sync_shadow_reconciliation`.

Incluyen empresa, módulo, tipo, origen, resultado, cantidad o bytes; no incluyen credenciales ni XML completo.

## Límites de esta etapa

No hay endpoint de lectura, cursor, aplicación cliente, paginación, limpieza de tombstones ni modificación del outbox. La retención y compactación quedan bloqueadas hasta medir dispositivos atrasados y aprobar una fase posterior.
