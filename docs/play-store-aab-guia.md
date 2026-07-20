# Guia rapida para generar AAB y subir a Google Play Console

Proyecto: FactuDarwin  
Ruta del proyecto movil: `C:\app`  
Paquete Android: `com.facturasri.mobile`  
Fecha de guia: 2026-06-25

## 1. Antes de generar una version

1. Verifique que el backend este levantado y responda:

```powershell
cd C:\app
npm run smoke:production
```

Debe salir algo parecido a:

```text
Smoke test OK: https://api.factudarwin.com/health
```

2. Verifique configuracion de produccion de la app:

```powershell
cd C:\app
npm run check:production
```

Debe indicar que la configuracion basica esta verificada.

3. Verifique TypeScript:

```powershell
cd C:\app
npm run typecheck
```

4. Ejecute pruebas:

```powershell
cd C:\app
npm test
```

5. Verifique lint solo sobre codigo fuente:

```powershell
cd C:\app
npm run lint
```

Nota: el lint del proyecto debe revisar `App.tsx`, `src` y `scripts`. No debe revisar carpetas generadas como `dist`, `android`, `node_modules` o respaldos.

## 2. Cambiar version de la app

La version se cambia con el script del proyecto. Este script actualiza:

- `app.json` -> `expo.version`
- `app.json` -> `expo.android.versionCode`
- `src/constants/branding.ts` -> `APP_VERSION`

Ejemplo para pasar a version `1.0.5`:

```powershell
cd C:\app
npm run version:bump -- 1.0.5
```

Si solo quiere probar sin escribir cambios:

```powershell
cd C:\app
npm run version:bump -- 1.0.5 check
```

Importante:

- Google Play no permite subir dos AAB con el mismo `versionCode`.
- Cada nueva subida debe tener version nueva o al menos `versionCode` mayor.
- No edite solo el nombre de version en Google Play; debe cambiarse en el proyecto antes de generar el AAB.

## 3. Generar AAB para Play Store con EAS

Comando principal:

```powershell
cd C:\app
npm run build:android:aab
```

Equivale a:

```powershell
npx eas-cli build --platform android --profile production
```

Cuando termine, Expo/EAS dara un enlace para descargar el archivo `.aab`.

El AAB es el archivo correcto para Google Play Console.  
El APK sirve para pruebas manuales, pero Google Play normalmente solicita AAB.

## 4. Generar APK para prueba manual

Si necesita una APK para instalar en telefono:

```powershell
cd C:\app
npm run build:android:apk
```

Equivale a:

```powershell
npx eas-cli build --platform android --profile preview
```

## 5. Subir AAB a Google Play Console

1. Entrar a Google Play Console.
2. Seleccionar la app `FactuDarwin`.
3. Ir a:

```text
Probar y publicar -> Pruebas -> Prueba interna
```

o si ya va a produccion:

```text
Probar y publicar -> Produccion
```

4. Crear nueva version.
5. Subir el archivo `.aab`.
6. Agregar notas de version.

Ejemplo de notas:

```text
<es-419>
Mejoras de estabilidad, sincronizacion, creditos, ventas e impresion de comprobantes.
Correcciones en flujo de ventas, cobros y experiencia PWA.
</es-419>
```

7. Guardar.
8. Revisar advertencias.
9. Enviar a revision o publicar en prueba interna.

## 6. Si Google Play dice que el codigo de version ya fue usado

Significa que el `versionCode` del AAB ya existe en Play Console.

Solucion:

```powershell
cd C:\app
npm run version:bump -- 1.0.6
npm run check:production
npm run build:android:aab
```

Luego subir el nuevo `.aab`.

## 7. Archivos donde se ve la version

`C:\app\app.json`

Campos importantes:

```json
{
  "expo": {
    "version": "1.0.5",
    "android": {
      "package": "com.facturasri.mobile",
      "versionCode": 9
    }
  }
}
```

`C:\app\src\constants\branding.ts`

Campo importante:

```ts
export const APP_VERSION = "1.0.5";
```

## 8. Checklist antes de subir

- Backend activo en `https://api.factudarwin.com`.
- `npm run smoke:production` correcto.
- `npm run check:production` correcto.
- `npm run typecheck` correcto.
- `npm test` correcto.
- Version nueva aplicada con `npm run version:bump -- X.X.X`.
- AAB generado con `npm run build:android:aab`.
- El archivo subido a Play Console es `.aab`, no `.apk`.
- Notas de version agregadas.
- Politica de privacidad configurada.
- Datos de acceso demo actualizados.

## 9. Comandos resumidos

Flujo recomendado completo:

```powershell
cd C:\app
npm run smoke:production
npm run check:production
npm run typecheck
npm run lint
npm test
npm run version:bump -- 1.0.5
npm run build:android:aab
```

Si ya cambió version y solo quiere generar:

```powershell
cd C:\app
npm run check:production
npm run build:android:aab
```

## 10. Nota importante

Cuando se sube una nueva version a Google Play, los usuarios no reciben los cambios inmediatamente hasta que Google apruebe la version y se publique en el canal correspondiente.

Para pruebas rapidas use primero `Prueba interna`.
