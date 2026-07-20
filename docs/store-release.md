# Publicacion Play Store / App Store

## Estado del proyecto

La app ya esta preparada para construir binarios con EAS:

- `app.json` define nombre, paquete Android, bundle iOS, icono, splash y version.
- `eas.json` apunta al backend oficial `https://api.factudarwin.com`.
- `npm run release:android:check` corre typecheck, lint, pruebas, validacion backend y validacion de produccion.
- `npm run version:bump -- 1.0.2` actualiza version, `versionCode`, `buildNumber` y version visible.

## Requisitos externos

- Cuenta Expo/EAS.
- Cuenta Google Play Developer.
- Backend publicado en HTTPS. No usar `localhost`, IP local ni tuneles temporales en produccion.
- Base de datos PostgreSQL con backups y restauracion probada.
- Politica de privacidad publicada en una URL publica.
- Borrador base disponible en `docs/privacy-policy-template.md`.
- Textos de Play Store disponibles en `docs/play-store-listing.md`.
- Capturas de pantalla y textos comerciales para Play Store.

## Backend de produccion

El backend oficial debe quedar en:

```txt
https://api.factudarwin.com
```

Variables minimas en `backend/.env`:

```env
NODE_ENV=production
AUTH_REQUIRED=true
PUBLIC_BACKEND_URL=https://api.factudarwin.com
DATABASE_URL=postgres://usuario:clave@host:5432/factudarwin
JWT_SECRET=********
ASSET_ENCRYPTION_SECRET=********
MASTER_ADMIN_KEY=********
SUPPORT_ADMIN_ENABLED=true
SUPPORT_ADMIN_EMAIL=soporte@factudarwin.com
SUPPORT_ADMIN_NAME=Soporte DarwinSoft
SUPPORT_ADMIN_PASSWORD_HASH=********
SRI_ENV=production
SRI_ALLOW_SEND=true
SRI_ALLOW_INSECURE_TLS=false
PG_BACKUP_ENABLED=true
PG_BACKUP_DIR=./backups/postgres
PG_BACKUP_RETENTION_DAYS=30
PG_DUMP_PATH=pg_dump
PG_RESTORE_PATH=pg_restore
PSQL_PATH=psql
SMTP_HOST=smtp.dominio.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=correo@dominio.com
SMTP_PASS=********
SMTP_FROM=correo@dominio.com
```

No subir a Git `backend/.env`, certificados `.p12`, claves privadas ni backups reales.

Generar secretos seguros:

```bash
cd backend
npm run secrets:generate
```

Generar hash para usuario soporte:

```bash
cd backend
npm run support:hash -- "CLAVE_SEGURA_DE_SOPORTE"
```

Copiar el resultado en `SUPPORT_ADMIN_PASSWORD_HASH`. No guardar la clave plana en produccion.

Validar el `.env` real del backend antes de reiniciar el servidor:

```bash
cd backend
npm run check:production
```

Probar backup y restauracion real:

```bash
cd backend
npm run backup:postgres
```

Este comando crea un `.dump`, restaura ese archivo en una base temporal y verifica tablas criticas antes de marcar el backup como valido.

## Build Android

Antes de generar:

```bash
npm run release:status
npm run release:preflight
```

Este comando corre typecheck, lint, pruebas, configuracion de produccion, aislamiento por empresa, indices PostgreSQL criticos y estado final de release. Si falla, no generar APK/AAB todavia.

Despues de subir el backend actualizado:

```bash
npm run smoke:production
```

Este comando consulta `https://api.factudarwin.com/health` y confirma HTTPS, PostgreSQL, autenticacion activa, backups y TLS SRI seguro.

APK para instalar directo o probar en telefonos:

```bash
npm run build:android:apk
```

AAB para Play Store:

```bash
npm run build:android:aab
```

Subir a Play Console con EAS:

```bash
npm run submit:android
```

## Checklist Play Store

- Backend actualizado y corriendo en `https://api.factudarwin.com`.
- `npm run release:android:check` sin errores.
- Version nueva con `npm run version:bump -- x.y.z`.
- Prueba real de login, sincronizacion, facturacion, nota de venta, proforma, credito, recibos y reportes.
- Prueba con dos telefonos sobre la misma empresa.
- Politica de privacidad publicada.
- Declaracion de seguridad de datos completada en Play Console.
- Ficha de tienda revisada desde `docs/play-store-listing.md`.
- Capturas de pantalla listas.
- Descripcion corta y descripcion completa listas.
- Soporte WhatsApp activo.
- No exponer modulos tecnicos a usuarios finales sin rol de soporte/admin.

## Nota importante sobre paquete Android

No cambiar `android.package` si ya hay clientes instalados con el paquete actual. Android trataria el nuevo paquete como otra app distinta y no actualizaria la instalada.
