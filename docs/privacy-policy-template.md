# Politica de privacidad - FactuDarwin

Ultima actualizacion: 2026-06-07

## Responsable

FactuDarwin es una aplicacion de DarwinSoft para gestion comercial, ventas, clientes, productos, inventario, cuentas por cobrar y facturacion electronica en Ecuador.

Contacto de soporte:

- WhatsApp: 593992152383
- Correo: soporte@factudarwin.com

## Datos que se registran

La aplicacion puede almacenar y procesar la siguiente informacion:

- Datos de empresa: RUC, razon social, nombre comercial, direccion, correo, establecimientos y puntos de emision.
- Datos de usuarios: nombre, correo, rol y credenciales de acceso cifradas o protegidas por el servidor.
- Datos de clientes: identificacion, nombres, correo, telefono, direccion y documentos relacionados.
- Datos de productos: codigo, descripcion, precio, IVA, stock, costo y movimientos de inventario.
- Datos transaccionales: facturas, notas de venta, proformas, notas de credito, guias de remision, cobros, abonos, cierres de caja y reportes.
- Archivos de configuracion: logotipo de la empresa y certificado electronico `.p12` cuando el usuario lo carga para firmar comprobantes.
- Datos tecnicos de soporte: eventos de sincronizacion, errores tecnicos, estado de conexion y diagnostico de la aplicacion.

## Uso de los datos

Los datos se utilizan para:

- Emitir y gestionar comprobantes electronicos autorizados por el SRI.
- Sincronizar informacion entre dispositivos autorizados de la misma empresa.
- Generar reportes comerciales, contables y operativos.
- Administrar inventario, clientes, productos, credito y cobros.
- Brindar soporte tecnico y diagnosticar problemas de conexion o sincronizacion.
- Validar licencias, planes, limites de uso y estado de la cuenta.

## Camara

La aplicacion solicita acceso a la camara solo para escanear codigos de barras o codigos de productos. FactuDarwin no usa la camara para grabar audio, video ni vigilancia.

## Certificado electronico

Cuando el usuario carga un certificado `.p12`, este se envia al servidor configurado para permitir la firma de comprobantes electronicos. El certificado no se guarda como archivo plano dentro de la aplicacion movil. La clave del certificado debe ser administrada por el usuario responsable de la empresa.

## Sincronizacion y almacenamiento

La aplicacion puede guardar informacion localmente en el dispositivo para permitir trabajo operativo y sincronizacion posterior. Tambien puede enviar informacion al backend oficial configurado por DarwinSoft para respaldos, sincronizacion multi-dispositivo, soporte y facturacion electronica.

El backend oficial de produccion es:

```txt
https://api.factudarwin.com
```

## Comparticion de datos

FactuDarwin puede compartir informacion con servicios necesarios para operar:

- Servicio de Rentas Internas del Ecuador (SRI), para recepcion y autorizacion de comprobantes.
- Proveedor de correo, para envio de comprobantes y notificaciones.
- Servicios de consulta autorizados por el usuario, para completar datos de RUC o cedula cuando aplique.
- Infraestructura de hosting, base de datos, almacenamiento y backups.

No se vende informacion personal de usuarios o clientes.

## Retencion de datos

La informacion comercial y tributaria puede conservarse durante el tiempo requerido por obligaciones legales, soporte, auditoria y continuidad operativa. Los logs tecnicos se conservan por un periodo limitado definido por la configuracion del servidor.

## Seguridad

FactuDarwin usa autenticacion, roles, servidor HTTPS, separacion por empresa, respaldos y controles de acceso. El usuario es responsable de proteger sus credenciales, certificado electronico y claves de acceso.

## Derechos del usuario

El titular de la cuenta puede solicitar soporte para revisar, corregir, respaldar o eliminar informacion cuando sea legal y tecnicamente posible, considerando las obligaciones tributarias y de auditoria aplicables.

## Cambios a esta politica

Esta politica puede actualizarse cuando se agreguen funciones, cambien requisitos legales o se mejore la infraestructura del servicio.
