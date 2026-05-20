# App liviana para produccion

## Reglas

- Para clientes finales, preferir `AAB` cuando se publique por Play Store. Android descarga solo lo necesario para cada telefono y queda mas liviana que un APK universal.
- Usar `APK` solo para instalacion directa o pruebas internas.
- No instalar `expo-dev-client` en builds finales. Agrega peso y herramientas de desarrollo que el cliente no necesita.
- Mantener `assetBundlePatterns` limitado a `assets/*` para evitar empacar archivos del proyecto por accidente.

## Comandos

APK para instalar directo:

```bash
npm run build:android:apk
```

AAB para Play Store:

```bash
npm run build:android:aab
```

Preview optimizado en formato AAB:

```bash
eas build --platform android --profile previewOptimized
```

## Dependencias nativas que pesan

- `expo-camera`: necesario para escanear codigos. Si se decide quitar el escaner, se puede remover para bajar mas peso.
- `expo-print`, `expo-sharing`, `expo-file-system`, `expo-intent-launcher`: necesarios para generar, ver y compartir PDF/reportes.
- `expo-dev-client`: no debe estar en produccion.

## Recomendacion operativa

Si el cliente instala desde Play Store, enviar `AAB`.
Si el cliente instala manualmente, enviar `APK`, pero sera mas pesado porque es universal.

