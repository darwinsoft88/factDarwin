# Backend FactuDarwin

Backend local para recibir el XML generado por la app movil, firmarlo con un archivo `.p12` y preparar el envio al SRI.

## Preparacion

1. Copia tu firma a:

```txt
backend/certs/firma.p12
```

2. Crea `backend/.env` a partir de `.env.example`:

```env
PORT=4000
SRI_ENV=test
SRI_CERT_PATH=./certs/firma.p12
SRI_CERT_PASSWORD=tu_clave_real
SRI_ALLOW_SEND=false
SRI_ALLOW_INSECURE_TLS=false
AUTH_REQUIRED=true
JWT_SECRET=usa_un_secreto_largo_y_privado
ASSET_ENCRYPTION_SECRET=usa_otro_secreto_estable_para_firmas_y_activos
JWT_EXPIRES_HOURS=12
MASTER_ADMIN_KEY=clave_larga_para_panel_darwinsoft
# Produccion recomendada:
# DATABASE_URL=postgres://usuario:clave@host:5432/factura_sri
# PGSSLMODE=require
```

No subas `backend/.env` ni `backend/certs/firma.p12` a Git.

`ASSET_ENCRYPTION_SECRET` cifra la firma `.p12` que cada empresa sube al servidor. Debe mantenerse estable entre despliegues; cambiarlo sin conservar el valor anterior obliga a volver a subir el `.p12`.

## Ejecutar

```bash
cd backend
npm install
npm run dev
```

## Endpoints

- `GET /health`
- `POST /api/auth/login`
- `POST /api/secuenciales/reservar`
- `POST /api/facturas/firmar`
- `POST /api/facturas/autorizar`
- `POST /api/sync/merge`
- `GET /master`
- `GET /api/master/license`
- `PUT /api/master/license`

Ejemplo:

```json
{
  "xml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><factura id=\"comprobante\" version=\"1.1.0\">...</factura>"
}
```

Con `AUTH_REQUIRED=true`, los endpoints sensibles requieren:

```txt
Authorization: Bearer TU_TOKEN_JWT
```

El token se obtiene con `POST /api/auth/login` enviando `email` y `password`. La app mantiene login local para poder trabajar offline, pero usa JWT cuando sincroniza, autoriza SRI, envia correos, restaura backups o ejecuta acciones sensibles del backend.

## Panel maestro DarwinSoft

El backend incluye un panel web simple para soporte/licencias:

```txt
http://localhost:4000/master
```

Antes configura una clave maestra fuerte en `backend/.env`:

```env
MASTER_ADMIN_KEY=una_clave_larga_y_privada
```

Desde ese panel puedes:

- ver estado de licencia,
- activar plan mensual/anual,
- renovar vencimiento,
- suspender cliente,
- habilitar o bloquear modulos.

Las API del panel usan el encabezado:

```txt
x-master-key: TU_MASTER_ADMIN_KEY
```

No compartas esta clave con clientes. Es solo para soporte DarwinSoft. Si la licencia queda vencida o suspendida, el backend bloquea acciones criticas como secuenciales, autorizacion SRI y envio de correos.

## Secuenciales centralizados

Para evitar claves duplicadas cuando varios telefonos venden al mismo tiempo, la app debe reservar el secuencial en el backend antes de emitir comprobantes SRI:

```txt
POST /api/secuenciales/reservar
```

Ejemplo:

```json
{
  "documentType": "factura",
  "createdAt": "2026-05-07T18:30:00.000Z",
  "issuer": {
    "ruc": "1723772099001",
    "environment": "1",
    "establishment": "002",
    "emissionPoint": "001",
    "sequential": 39
  }
}
```

Respuesta:

```json
{
  "ok": true,
  "documentType": "factura",
  "sequence": "000000039",
  "accessKey": "..."
}
```

El backend guarda el contador en `document_sequences` y lo incrementa de forma transaccional. En produccion multi-dispositivo, este endpoint es la fuente oficial del secuencial.

## Sincronizacion incremental

Para varios telefonos, la app no debe depender de `Subir cambios` despues de cada venta. El endpoint incremental permite guardar solo el cambio realizado:

```txt
POST /api/sync/merge
```

Acepta listas parciales:

```json
{
  "baseData": { "...": "solo se usa si la base del backend esta vacia" },
  "issuer": { "sequential": 40 },
  "sales": [{ "id": "venta-1", "sequence": "000000039" }],
  "products": [{ "id": "producto-1", "stock": 9 }],
  "inventoryMovements": [{ "id": "mov-1" }],
  "auditLogs": [{ "id": "audit-1" }],
  "deletions": {
    "clients": ["cliente-1"],
    "products": ["producto-1"]
  }
}
```

El backend bloquea la copia actual, mezcla por `id` y guarda en una transaccion. Esto evita que un telefono reemplace ventas creadas por otro.

Actualmente se usa para:

- Facturas, notas de credito y guias emitidas.
- Clientes y productos.
- Movimientos manuales de inventario.
- Cierres de caja.
- Usuarios y permisos.

## Cola offline

Si un telefono no logra enviar un cambio incremental por falta de internet o backend apagado, la app guarda el cambio en `pendingSync`.

Cuando vuelve a sincronizar:

1. Reintenta enviar cada pendiente con `POST /api/sync/merge`.
2. Quita los enviados correctamente.
3. Conserva los que fallan con contador de intentos y ultimo error.

Mientras existan pendientes, la app evita cargar copia del backend para no pisar cambios locales sin subir.

En modo SaaS/produccion, una subida completa a `POST /api/data` no reemplaza la empresa completa: el backend la mezcla de forma transaccional con la copia actual. Esto evita que un telefono atrasado borre ventas, guias, clientes, productos o usuarios que otro telefono ya sincronizo.

Las eliminaciones de catalogos se guardan como tombstones:

- clientes eliminados en `deletedIds.clients`;
- productos eliminados en `deletedIds.products`;
- usuarios eliminados en `deletedIds.users`;

Si una copia vieja intenta reintroducir uno de esos registros, el backend lo filtra antes de guardar. Esta regla es obligatoria para operacion multi-telefono.

Los puntos de emision se eliminan fisicamente de `issuer.establishments` cuando no tienen documentos asociados. Para evitar que un telefono viejo los reintroduzca, el backend compara `issuer.establishmentsUpdatedAt` y conserva la lista mas reciente durante el merge transaccional.

## Historial escalable

Para produccion de varios meses o anos, el telefono no debe cargar todo el historial. El backend conserva los documentos completos en tablas normalizadas y mantiene el snapshot de la app como copia compacta de trabajo reciente.

Politica por defecto del snapshot movil:

- ventas recientes: 395 dias o al menos 1200 documentos;
- guias recientes: 395 dias o al menos 800 documentos;
- movimientos de inventario recientes: 1500;
- auditoria reciente: 1500;
- cierres de caja: 730 dias o al menos 800 cierres.

Se puede ajustar con variables:

```env
SNAPSHOT_RECENT_SALES_DAYS=395
SNAPSHOT_RECENT_SALES_LIMIT=1200
SNAPSHOT_RECENT_GUIDE_DAYS=395
SNAPSHOT_RECENT_GUIDE_LIMIT=800
SNAPSHOT_RECENT_MOVEMENT_LIMIT=1500
SNAPSHOT_RECENT_AUDIT_LIMIT=1500
SNAPSHOT_RECENT_CASH_CLOSING_DAYS=730
SNAPSHOT_RECENT_CASH_CLOSING_LIMIT=800
```

Para consultar historico completo sin descargarlo al telefono:

- `GET /api/history/sales?limit=50&offset=0&dateFrom=2026-01-01&dateTo=2026-12-31`
- `GET /api/history/sales?clientId=...&search=000000123`
- `GET /api/history/guides?limit=50&offset=0`

Estos endpoints aceptan `limit`, `offset`, `clientId`, `status`, `dateFrom`, `dateTo` y `search`. Ventas tambien acepta `documentType`.

## Envio real al SRI

Por seguridad el backend arranca con `SRI_ALLOW_SEND=false`. En ese modo firma/prepara, pero no envia al SRI.

Cuando ya estes probando con datos validos del contribuyente, cambia:

```env
SRI_ALLOW_SEND=true
SRI_ENV=test
```

Primero usa ambiente de pruebas. Produccion debe activarse solo despues de validar la firma y respuestas del SRI.

Si el ambiente de pruebas del SRI falla con `ERR_TLS_CERT_ALTNAME_INVALID`, puede activar temporalmente:

```env
SRI_ALLOW_INSECURE_TLS=true
```

Uselo solo para diagnostico/pruebas, porque desactiva la validacion TLS estricta al conectar con los servicios del SRI.

## Base de datos

El backend soporta dos motores:

- Sin `DATABASE_URL`: usa SQLite local en `backend/data/factura-sri-main.db`.
- Con `DATABASE_URL`: usa PostgreSQL, recomendado para produccion.

En modo SaaS, las tablas normalizadas usan `company_id` para separar tenants. Toda consulta de historial, reporte o soporte debe filtrar por empresa:

```sql
WHERE company_id = $1
```

Esto aplica a ventas, items, guias, clientes, productos, usuarios, inventario, auditoria, cajas y secuencias.

Ejemplo PostgreSQL local:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/factura_sri
```

Ejemplo PostgreSQL administrado con SSL:

```env
DATABASE_URL=postgres://usuario:clave@host:5432/factura_sri
PGSSLMODE=require
```

Al iniciar, el backend crea automaticamente las tablas necesarias:

- `app_snapshots`
- `app_snapshot_history`
- `audit_log`
- `users`
- `clients`
- `products`
- `sales`
- `sale_items`
- `remission_guides`
- `inventory_movements`
- `app_audit_logs`
- `cash_closings`

Para migrar datos desde la app al PostgreSQL:

1. Configura `DATABASE_URL` en `backend/.env`.
2. Reinicia el backend.
3. En la app entra a `SRI`.
4. Usa `Probar conexion` y confirma que el motor diga `postgres`.
5. Presiona `Subir cambios`.

## Backups PostgreSQL

Con `DATABASE_URL` activo, el backend puede crear respaldos diarios con `pg_dump`.

Variables recomendadas:

```env
PG_BACKUP_ENABLED=true
PG_BACKUP_DIR=./backups/postgres
PG_BACKUP_TIME=23:30
PG_BACKUP_RETENTION_DAYS=30
PG_DUMP_PATH=pg_dump
PG_RESTORE_PATH=pg_restore
PSQL_PATH=psql
```

En Windows, si las herramientas de PostgreSQL no estan en el PATH, usa la ruta completa:

```env
PG_DUMP_PATH=C:\Program Files\PostgreSQL\18\bin\pg_dump.exe
PG_RESTORE_PATH=C:\Program Files\PostgreSQL\18\bin\pg_restore.exe
PSQL_PATH=C:\Program Files\PostgreSQL\18\bin\psql.exe
```

Respaldo manual:

```bash
cd backend
npm run backup:postgres
```

El respaldo se guarda como `.dump` en `backend/backups/postgres`. Despues de crear cada respaldo, el backend hace una prueba real de restauracion:

1. Crea una base temporal `factudarwin_restore_*`.
2. Restaura el `.dump` con `pg_restore`.
3. Verifica tablas criticas como empresas, snapshots, ventas, productos e inventario.
4. Elimina la base temporal.

Si la prueba falla, el respaldo manual o programado falla para que el problema se vea a tiempo.

Tambien puedes revisar el estado con:

- `GET /api/backups/postgres`
- `POST /api/backups/postgres` para lanzar un respaldo manual desde API.

## Logs tecnicos para soporte

El backend guarda logs tecnicos diarios en `backend/logs` para diagnosticar errores de conexion, autorizacion SRI, correo, login, respaldos y endpoints lentos o fallidos.

Variables:

```env
TECHNICAL_LOGS_ENABLED=true
TECHNICAL_LOGS_DIR=./logs
TECHNICAL_LOGS_RETENTION_DAYS=30
TECHNICAL_LOGS_MAX_READ=300
TECHNICAL_LOGS_SUCCESS=false
TECHNICAL_LOGS_INCLUDE_STACK=false
```

Por seguridad, los logs no guardan contrasenas, tokens, HTML completo ni XML completo; solo resumen de raiz, clave de acceso y longitud del XML.

Consulta desde API:

- `GET /api/support/logs?limit=80`

Tambien se pueden ver desde la pantalla `SRI > Logs tecnicos` de la app con usuario administrador.
