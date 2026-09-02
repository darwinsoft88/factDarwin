# Backups y recuperación — preparación local

## Ciclo global

`scripts/run-backup-cycle.sh` deriva la raíz desde su propia ubicación y ejecuta
un único orquestador Node. `scripts/run-backup-cycle.js` genera un `cycleId` y
transporta rutas exactas entre las tres etapas, en orden:

1. dump PostgreSQL con restauración de prueba;
2. activos `uploads/companies` en `tar.gz` con inventario SHA-256 y extracción de prueba;
3. paquete local cifrado AES-256-GCM/HKDF-SHA256.

El flujo oficial nunca vuelve a buscar el archivo más reciente. El manifiesto
offsite y el directorio final contienen el mismo `cycleId`, y el paquete queda
formado exclusivamente por el dump y los activos devueltos por esa ejecución.

Para la selección humana de puntos de recuperación se usa siempre
`America/Guayaquil`. El `cycleId`, el directorio final y la ruta futura de
organización remota usan la fecha/hora Ecuador. UTC se conserva únicamente
como referencia técnica y de auditoría en `createdAtUtc`; no se modifican los
timestamps internos de PostgreSQL ni de los datos empresariales.

El dump y los activos usan bloqueo, comprobación de espacio, archivos temporales,
publicación atómica y retención únicamente después de verificar el nuevo respaldo.
El secreto `ASSET_ENCRYPTION_SECRET` no se incorpora a los respaldos y debe
custodiarse fuera del servidor junto con el procedimiento de recuperación.

## Estado de integración remota

La fase local no instala, autentica ni configura MEGA. El destino de
`create-offsite-backup.js` es una carpeta local de staging. La configuración y
primera prueba real de MEGA requieren intervención manual del propietario.

## Recuperación

Antes de una recuperación global se debe validar el SHA-256, descifrar en una
carpeta temporal, restaurar PostgreSQL en una base de prueba y verificar el
manifiesto de activos antes de reemplazar rutas activas. El restore individual
usa reconciliación fiscal, tombstones y secuenciales monotónicos dentro de una
transacción; no restaura colas de correo, sesiones ni operaciones idempotentes.
