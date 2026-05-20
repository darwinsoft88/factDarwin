# Publicacion Play Store / App Store

## Estado del proyecto

La app ya esta preparada para construir binarios con EAS:

- `app.json` con `bundleIdentifier`, `package`, icono, splash y version.
- `eas.json` con perfiles `development`, `preview` y `production`.
- Scripts npm para build y submit.
- Backend configurable con `EXPO_PUBLIC_BACKEND_URL`.

## Requisitos externos

- Cuenta Expo.
- EAS CLI instalado:

```bash
npm install -g eas-cli
eas login
```

- Cuenta Google Play Developer para Android.
- Cuenta Apple Developer para iOS.
- Backend publicado en HTTPS. No usar `localhost` ni IP local en produccion.

## Backend de produccion

El backend debe quedar publicado en una URL HTTPS, por ejemplo:

```txt
https://facturas.tudominio.com
```

En `backend/.env` de produccion:

```env
SRI_ENV=production
SRI_ALLOW_SEND=true
SRI_CERT_PATH=./certs/firma.p12
SRI_CERT_PASSWORD=********
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=correo@dominio.com
SMTP_PASS=********
SMTP_FROM=correo@dominio.com
DB_PATH=./data/factura-sri.sqlite
```

## Configurar app para produccion

En `eas.json`, reemplaza:

```json
"EXPO_PUBLIC_BACKEND_URL": "https://facturas.tudominio.com"
```

por la URL real HTTPS del backend.

En `app.json`, reemplaza:

```json
"owner": "REEMPLAZAR-CON-TU-USUARIO-EXPO"
```

y si ya tienes proyecto EAS:

```json
"projectId": "REEMPLAZAR-CON-EAS-PROJECT-ID"
```

Tambien conviene cambiar los identificadores si usaras una marca real:

```json
"bundleIdentifier": "com.tuempresa.facturasri"
"package": "com.tuempresa.facturasri"
```

## Build Android

```bash
npm run build:android
```

Para pruebas internas:

```bash
eas build --platform android --profile preview
```

## Build iOS

```bash
npm run build:ios
```

Apple requiere cuenta Apple Developer y configuracion de certificados/provisioning.

## Submit

Android:

```bash
npm run submit:android
```

iOS:

```bash
npm run submit:ios
```

Segun la documentacion oficial de Expo, para publicar necesitas construir un build de produccion con EAS Build y luego subirlo con EAS Submit o manualmente desde las consolas de Google/Apple.

Fuentes oficiales:

- https://docs.expo.dev/deploy/build-project/
- https://docs.expo.dev/deploy/submit-to-app-stores/
- https://docs.expo.dev/eas/json/

## Checklist antes de enviar a tiendas

- Probar emision en ambiente de pruebas.
- Probar una factura real controlada en produccion.
- Confirmar que el backend usa HTTPS.
- Cambiar `SRI_ENV=production`.
- Cambiar ambiente de la app a `Produccion`.
- Revisar RUC, establecimiento, punto de emision y secuencial real.
- Reemplazar icono/logo temporal por marca final.
- Preparar politica de privacidad.
- Preparar screenshots de la app.
- No subir `backend/.env` ni `backend/certs/firma.p12`.
- Rotar claves que hayan sido compartidas en capturas.
