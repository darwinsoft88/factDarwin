# Checklist de produccion

Este documento resume los pasos ya aplicados y los controles que faltan antes de subir `FactuDarwin` a produccion.

## Revision de cierre 2026-07-01

- `npm run typecheck`: OK.
- `npm run check:production`: OK.
- `npm run release:status`: OK 14/14.
- `cd backend && npm run check:production`: OK.
- `cd backend && npm run check:indexes`: OK, 28 indices criticos definidos.
- `cd backend && npm run check:tenant`: OK, consultas criticas con `company_id`.
- Se reforzo `PrimaryButton` con bloqueo anti doble toque para reducir cobros, guardados o emisiones duplicadas por presionar varias veces mientras una accion esta procesando.
- Las alertas superiores quedan enfocadas en conexion/sincronizacion y documentos SRI pendientes o rechazados; stock bajo se mantiene en el panel de alertas normal.

## Ya verificado

- `npm run typecheck` pasa sin errores.
- `npm test` pasa sin errores.
- `npm run lint` pasa limpio, sin warnings.
- `node --check` pasa en `backend/src/server.js`, `backend/src/auth.js`, `backend/src/db.js` y `backend/src/db-postgres.js`.
- `npm run check:production` queda disponible como compuerta antes del build final.
- `npm run release:preflight` queda disponible como compuerta unica antes de APK/AAB.
- `npm run release:status` queda disponible como reporte rapido de pendientes finales.
- `npm run smoke:production` queda disponible para validar el backend HTTPS real despues del despliegue.
- Se configuro ESLint con TypeScript, React y hooks.
- Se agrego Jest con pruebas basicas de autenticacion y mensajes de error.
- Se agregaron pruebas para mezcla de datos, establecimientos, secuencias activas y cola `pendingSync`.
- Se agrego CI en `.github/workflows/ci.yml`.
- Se separo parte importante de `App.tsx` hacia `components`, `hooks`, `services` y `utils`.
- Se limpio deuda segura de imports, codigo muerto y warnings de hooks.
- El backend ahora bloquea arranque en produccion si falta `DATABASE_URL`, si `PUBLIC_BACKEND_URL` no es HTTPS, si `AUTH_REQUIRED=false`, si TLS inseguro del SRI esta activo o si `SRI_ENV=production` no tiene `SRI_ALLOW_SEND=true`.
- Las tablas normalizadas principales ya incluyen `company_id`: usuarios, clientes, productos, ventas, items, guias, inventario, auditoria, cajas y secuencias.
- La sincronizacion SaaS reemplaza datos normalizados solo dentro de `company_id`, evitando borrar o cruzar datos de otra empresa.
- El backend define y verifica indices PostgreSQL criticos para ventas, clientes, productos, inventario, guias, cajas, usuarios SaaS y snapshots.

## Falta antes de produccion

- Corregir los bloqueos actuales de `npm run check:production`: URL real del backend en `eas.json`, `PUBLIC_BACKEND_URL`, `JWT_SECRET`, `ASSET_ENCRYPTION_SECRET` real y `SRI_ALLOW_INSECURE_TLS=false`.
- Ejecutar `npm run release:status` y cerrar todos los puntos en `FALTA`.
- Ejecutar `npm run release:preflight` antes de generar APK/AAB.
- Probar sincronizacion real con dos telefonos y el mismo cliente.
- Validar que cada RUC solo vea sus establecimientos y secuencias.
- Validar reportes/historial SQL con dos empresas distintas para confirmar filtros `WHERE company_id = ...`.
- Confirmar que eliminacion de establecimientos se elimina tambien en backend PostgreSQL.
- Revisar `.env` real del backend: `DATABASE_URL`, `PUBLIC_BACKEND_URL`, `AUTH_REQUIRED`, `JWT_SECRET`, `ASSET_ENCRYPTION_SECRET`, `SRI_ENV`, `SRI_ALLOW_SEND`, correo, certificado y secretos.
- Revisar backup PostgreSQL: `PG_BACKUP_ENABLED`, `PG_BACKUP_DIR`, `PG_DUMP_PATH`, `PG_RESTORE_PATH`, `PSQL_PATH` y retencion minima de 7 dias.
- Ejecutar `cd backend && npm run backup:postgres` para crear backup y probar restauracion real en una base temporal.
- Subir backend actualizado antes de generar/repartir APK o AAB.
- Ejecutar `npm run smoke:production` contra `https://api.factudarwin.com`.
- Ejecutar build Android final: APK para prueba interna o AAB para Play Store.
- Hacer prueba de emision SRI en ambiente correcto antes de activar produccion.

## Siguiente refactor recomendado

- Extraer sincronizacion/backup de `App.tsx` hacia `src/services` o `src/hooks`.
- Ampliar pruebas unitarias para emision SRI, reserva transaccional de secuencias y eliminacion en backend.
- Mantener `App.tsx` bajando por cortes pequenos, sin tocar logica fiscal junto con cambios visuales.
