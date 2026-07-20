# Recuperacion de documentos por soporte

Este procedimiento se usa cuando un cliente indica que una factura, nota de venta o documento autorizado no aparece en la app despues de una falla de conexion, cache, cierre de sesion o sincronizacion incompleta.

## Regla principal

No se debe inventar un documento manualmente.

Para facturas SRI, primero se comprueba la clave de acceso. Si el SRI la tiene autorizada, se recupera el XML autorizado y se reconstruye el registro en la empresa correcta.

Para notas de venta, proformas o tickets offline, se recuperan desde la data local/snapshot si existen. Si nunca llegaron al backend y el usuario borro cache/local storage, no hay fuente tecnica confiable para reconstruirlas.

## 1. Identificar la empresa

Buscar el `empresa_id` o `companyId` del cliente.

Ejemplo:

```powershell
cd C:\app
node scripts\verify-recovered-docs.js co-1778704993458-b96dbd40c99b
```

Si no conoces el `companyId`, buscar por RUC en logs o en base de datos.

```powershell
cd C:\app
rg "1723772099001|000000183|000000187|NV-000000044" backend\logs backend\recoveries scripts
```

## 2. Buscar evidencia

Buscar por:

- RUC del cliente.
- Secuencial: `000000183`.
- Numero completo: `002-010-000000183`.
- Clave de acceso.
- Fecha del incidente.

Ejemplo:

```powershell
cd C:\app
rg "000000183|002-010-000000183|290620260117237720990011002010000000183" backend\logs backend\recoveries
```

## 3. Hacer respaldo antes de tocar datos

Nunca recuperar sin respaldo.

```powershell
cd C:\app
node scripts\backup-tenant-snapshot.js co-1778704993458-b96dbd40c99b
```

El respaldo queda en:

```text
C:\app\backend\recoveries\
```

## 4. Facturas SRI: consultar autorizacion

Si tienes clave de acceso, consulta el SRI y guarda el XML autorizado:

```powershell
cd C:\app
node scripts\recover-authorized-docs.js 2906202601172377209900110020100000001831234567815
```

Puedes consultar varias claves en el mismo comando:

```powershell
node scripts\recover-authorized-docs.js 2906202601172377209900110020100000001831234567815 2906202601172377209900110020100000001871234567817
```

Si el SRI responde `AUTORIZADO`, se crean archivos como:

```text
C:\app\backend\recoveries\factura-000000183.xml
C:\app\backend\recoveries\factura-000000183.json
```

## 5. Reconstruir la factura en la empresa

Con el XML guardado, recuperar en el snapshot/base del cliente:

```powershell
cd C:\app
node scripts\recover-missing-sales.js co-1778704993458-b96dbd40c99b factura-000000183.xml=2026-06-29T09:47:33-05:00
```

Varias facturas:

```powershell
node scripts\recover-missing-sales.js co-1778704993458-b96dbd40c99b factura-000000183.xml=2026-06-29T09:47:33-05:00 factura-000000187.xml=2026-06-29T12:00:12-05:00
```

El script no duplica documentos si ya existen por clave de acceso o por `establecimiento + punto + secuencia`.

## 6. Verificar recuperacion

```powershell
cd C:\app
node scripts\verify-recovered-docs.js co-1778704993458-b96dbd40c99b
```

Debe devolver:

```json
{
  "ok": true
}
```

Y mostrar las secuencias esperadas en `tableHits` y `snapshotHits`.

## 7. Pedir al cliente actualizar datos

Despues de recuperar:

1. Abrir la app.
2. Ir al menu.
3. Presionar `Sincronizar` o `Actualizar datos`.
4. Revisar el listado de ventas/documentos.

No pedir al cliente borrar cache antes de intentar sincronizar. Borrar cache puede eliminar pendientes locales que aun no llegaron al backend.

## 8. Si es nota de venta, proforma o ticket offline

Estos documentos no se pueden consultar al SRI.

Revisar primero si existen en snapshot:

```powershell
cd C:\app
node scripts\verify-recovered-docs.js co-1778704993458-b96dbd40c99b
```

Si no aparecen en backend, revisar el dispositivo donde se crearon antes de cerrar sesion o borrar cache.

## 9. Causas comunes

- El documento fue autorizado por el SRI, pero fallo la sincronizacion final al backend.
- El dispositivo tenia URL vieja o cache vieja.
- El usuario cerro sesion antes de que la cola local suba documentos pendientes.
- La app estaba conectada a un backend local/tunel no disponible desde datos moviles.
- El documento quedo en estado pendiente local, pero no se persistio correctamente en servidor.

## 10. Medida permanente recomendada

Para produccion, el backend debe tener una recuperacion automatica:

- Guardar intento antes de enviar al SRI.
- Guardar clave de acceso inmediatamente.
- Si SRI autoriza pero falla la sincronizacion, reconstruir por clave de acceso.
- Bloquear reenvios duplicados por clave de acceso.
- Tener pantalla de soporte para buscar por RUC, secuencia o clave de acceso.
- Mostrar al usuario estado claro: `PENDIENTE_SRI`, `AUTORIZADA`, `PENDIENTE_SYNC`, `ERROR_SYNC`.

## Caso real recuperado

Empresa:

```text
co-1778704993458-b96dbd40c99b
```

Documentos:

```text
002-010-000000183 | AUTORIZADA | $75.00
002-010-000000187 | AUTORIZADA | $100.00
NV-000000044      | CONVERTIDA | $100.00
```
