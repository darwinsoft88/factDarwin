# Estabilización final de SQLite — Fase 2

## Decisiones cerradas

- El archivo privado continúa siendo la fuente canónica de la aplicación.
- Los espejos se actualizan únicamente después de confirmar ese archivo.
- Un error SQLite no revierte ni invalida el guardado canónico.
- La PWA no abre `expo-sqlite` y conserva su almacenamiento web.
- `pendingSync` se ejecuta exclusivamente desde el archivo y el outbox.
  `pending_sync_operations` no es una fuente operativa.
- No se soporta downgrade de esquema. Una APK anterior no debe instalarse
  encima de una base creada por una APK con esquema más nuevo.

## Matriz de migraciones

Las pruebas utilizan directamente `SQLITE_SCHEMA_V1` a
`SQLITE_SCHEMA_V11`, en el orden definido por `SQLITE_MIGRATIONS`.

| Origen | Destino | Migraciones ejecutadas |
|---|---:|---|
| Instalación limpia | v11 | v1–v11 |
| v1 | v11 | v2–v11 |
| v2 | v11 | v3–v11 |
| v3 | v11 | v4–v11 |
| v4 | v11 | v5–v11 |
| v5 | v11 | v6–v11 |
| v6 | v11 | v7–v11 |
| v7 | v11 | v8–v11 |
| v8 | v11 | v9–v11 |
| v9 | v11 | v10–v11 |
| v10 | v11 | v11 |

Cada ruta comprueba llegada a v11, segunda ejecución idempotente, reapertura
sin nuevas migraciones y rollback si falla la siguiente migración.

## Inventario final de espejos

| Espejo | Desde | Tablas principales | Fuente canónica | Lectura controlada | Flag nativo | PWA |
|---|---:|---|---|---|---|---|
| Clientes | v1/v2 | `clients` | Archivo | Sí | `EXPO_PUBLIC_SQLITE_CATALOG_READS` | Archivo |
| Productos | v1/v3 | `products` | Archivo | Sí | `EXPO_PUBLIC_SQLITE_CATALOG_READS` | Archivo |
| Ventas | v5 | `sales`, líneas, pagos, información adicional, historiales y XML | Archivo | Sí | `EXPO_PUBLIC_SQLITE_SALES_READS` | Archivo |
| Movimientos de inventario | v7 | `inventory_movements` | Archivo | Sí | `EXPO_PUBLIC_SQLITE_INVENTORY_MOVEMENT_READS` | Archivo |
| Pagos y ajustes de cartera | v8 | `credit_payments`, `credit_adjustments` | Archivo | Sí | `EXPO_PUBLIC_SQLITE_CREDIT_LEDGER_READS` | Archivo |
| Retenciones recibidas | v9 | `received_retentions` | Archivo | Sí | `EXPO_PUBLIC_SQLITE_RECEIVED_RETENTIONS_READS` | Archivo |
| Guías de remisión | v10 | `remission_guides`, líneas y XML | Archivo | Sí | `EXPO_PUBLIC_SQLITE_REMISSION_GUIDE_READS` | Archivo |
| Cola pendiente | v11 | `pending_sync_operations` | Archivo + outbox | **No** | Ninguno | Outbox actual |

Todos los espejos tienen recibo por `tenant_id`, generación, hash, conteo,
versión de esquema, estado y detalle de validación. Las lecturas controladas
usan el archivo completo ante cualquier fallo y nunca mezclan fuentes.

## Orden de guardado

1. Persistir outbox canónico.
2. Escribir y verificar el snapshot canónico.
3. Confirmar el guardado al flujo de la aplicación.
4. Programar los espejos de manera desacoplada y serializada por tenant.
5. Conservar el guardado aunque un espejo falle; el recibo permite
   reconstrucción posterior.

## Métricas locales

No existe telemetría externa. Los siguientes eventos JSON se escriben
únicamente en el log local:

- `sqlite_migrations_completed`: origen, destino, cantidad y duración.
- `sqlite_startup_performance`: apertura, PRAGMA, migración y total.
- `canonical_snapshot_saved`: duración del guardado confirmado y generación.
- `sqlite_mirror_stabilization`: espejo, tenant, resultado y duración.

Presupuestos provisionales que deben validarse en Android físico:

- apertura caliente total: objetivo menor a 500 ms; investigar sobre 1 s;
- actualización de esquema: objetivo menor a 2 s; investigar sobre 3 s;
- guardado canónico normal: objetivo menor a 500 ms;
- guardado con snapshot grande: investigar sobre 2 s;
- reconstrucción individual representativa: objetivo menor a 2 s;
- reconstrucción máxima razonable: investigar sobre 5 s.

Estos límites son alertas, no pruebas frágiles. Los tiempos válidos son los
del dispositivo; los tiempos de Jest no se usan como rendimiento.

## Protocolo Android

1. Instalar encima de la APK anterior, sin desinstalar.
2. Conservar sesión, empresas, datos locales y pendientes.
3. Capturar logs:

   `adb logcat | findstr "sqlite_ canonical_snapshot_saved"`

4. Abrir, iniciar sesión, cambiar de empresa y regresar.
5. Recorrer Clientes, Productos, Ventas, Inventario, Créditos, Retenciones y
   Guías con flags apagados y luego con los flags aprobados.
6. Crear y editar datos; comprobar que el éxito corresponde al archivo.
7. Crear una operación offline, forzar cierre y reabrir.
8. Confirmar un único `requestId`, un único envío y ausencia de duplicados.
9. Repetir sin internet.
10. Registrar tiempos de los cuatro eventos para volumen pequeño,
    representativo y máximo razonable.

## Recuperación y riesgos

- Una transacción fallida conserva la versión anterior y sus recibos.
- Generación, hash, conteo, tenant o recibo incompatibles fuerzan fallback.
- Un cierre durante reconstrucción revierte ese espejo; el archivo permanece.
- SQLite corrupto o no disponible no debe impedir inicio ni guardado.
- La primera reconstrucción después de actualizar puede consumir recursos,
  pero se ejecuta fuera del guardado canónico.
- El downgrade no está soportado; restaurar una APK anterior exige preservar
  y recuperar los datos canónicos, no reutilizar una base SQLite más nueva.
