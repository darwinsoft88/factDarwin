# Checklist de produccion

## Backend

- Publicar el backend en HTTPS con dominio propio, por ejemplo `https://facturas.tudominio.com`.
- Configurar `PUBLIC_BACKEND_URL` con la URL publica real.
- Configurar `CORS_ORIGINS` con los dominios web permitidos. La app movil puede entrar sin `Origin`, por eso sigue funcionando.
- Mantener `REQUIRE_HTTPS=true`, `AUTH_REQUIRED=true` y `NODE_ENV=production`.
- Cambiar `JWT_SECRET` y `MASTER_ADMIN_KEY` por claves largas y privadas.
- Usar `SRI_ENV=test` para pruebas finales y cambiar a `SRI_ENV=production` solo cuando ya se vaya a emitir legalmente.
- Guardar certificados `.p12`, base de datos y respaldos fuera del repositorio.
- Verificar respaldos automaticos y restauracion antes de entregar a clientes.

## App

- No usar tuneles Cloudflare en builds de clientes.
- Configurar `EXPO_PUBLIC_BACKEND_URL=https://facturas.tudominio.com` en `eas.json` o en variables de EAS.
- Para pruebas internas con tunel temporal, usar `.env.local` basado en `.env.local.example`.
- Crear cuenta de cliente desde la pantalla de registro con su RUC real activo en SRI.
- La empresa DEMO queda solo para pruebas internas de programadores.

## Prueba antes de publicar

1. Crear una cuenta nueva con RUC real de prueba.
2. Iniciar sesion con correo y con RUC.
3. Probar modo sin internet: crear ticket, cerrar app, abrir app, verificar que el ticket siga visible.
4. Recuperar internet y sincronizar.
5. Convertir ticket a factura y confirmar que el ticket interno no aparezca como venta activa.
6. Emitir en ambiente SRI de pruebas.
7. Confirmar envio de correo.
8. Revisar orden de ventas en movil y web.
