# FactuDarwin Mobile

Aplicacion movil Expo/React Native para iOS y Android orientada a facturacion electronica ecuatoriana: usuarios, clientes, productos, ventas y generacion de factura XML.

## Alcance actual

- Login local por usuario.
- CRUD basico de clientes y productos.
- Creacion de ventas con calculo de IVA.
- Generacion de clave de acceso SRI con modulo 11.
- Generacion de XML base de factura electronica.
- Registro de estado para envio/autorizacion.

## Requisito SRI importante

Segun la pagina oficial de Facturacion Electronica del SRI, los comprobantes electronicos requieren firma electronica y el esquema actual es off-line. La app incluye la capa de generacion, pero la firma XAdES-BES y el envio SOAP al SRI deben ejecutarse preferiblemente en un backend seguro para no guardar el certificado del contribuyente dentro del telefono.

Fuentes oficiales consultadas:

- https://www.sri.gob.ec/facturacion-electronica
- https://www.sri.gob.ec/nl/web/intersri/facturacion-electronica

## Ejecutar

```bash
npm install
npm run start
```

Luego abre con Expo Go, emulador Android o simulador iOS.

## Ejecutar con backend SRI

1. Copia tu firma en:

```txt
C:\app\backend\certs\firma.p12
```

2. Edita:

```txt
C:\app\backend\.env
```

Y cambia:

```env
SRI_CERT_PASSWORD=CAMBIA_ESTA_CLAVE
```

por la clave real de tu firma.

3. En una terminal:

```bash
cd C:\app\backend
npm run start
```

4. Verifica en el navegador:

```txt
http://localhost:4000/health
```

5. En otra terminal:

```bash
cd C:\app
npm run start
```

6. En la app, entra a `SRI` y revisa la URL backend:

```txt
http://192.168.11.10:4000
```

Si usas emulador Android puede ser:

```txt
http://10.0.2.2:4000
```

Si pruebas desde navegador en la misma PC:

```txt
http://localhost:4000
```

## Pasar a produccion

Antes de emitir en produccion:

1. Confirma que el contribuyente esta habilitado para facturacion electronica en produccion.
2. Configura datos reales del emisor en la app: RUC, razon social, establecimiento, punto de emision y secuencial.
3. En `backend/.env` usa:

```env
SRI_ENV=production
SRI_ALLOW_SEND=true
```

4. En la app, pestaña `SRI`, usa:

```txt
Ambiente: Produccion
```

El backend valida que el XML tenga ambiente `1` para pruebas y `2` para produccion, para evitar envios cruzados por error.

## Publicar en tiendas

Ver la guia:

```txt
docs/store-release.md
```
