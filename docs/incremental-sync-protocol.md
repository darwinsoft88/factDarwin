# FactuDarwin Incremental Sync Protocol

Este contrato es independiente de las versiones de formato de backup.

## Negociación

El cliente anuncia una única capacidad mediante `X-Sync-Protocol-Version`.
La ausencia del encabezado, un valor vacío o una versión desconocida se trata
conservadoramente como V1. El cursor firmado queda ligado a la versión
negociada y no puede reutilizarse entre V1 y V2.

## V1

- Entidades: `client`, `product`.
- Compatible con las aplicaciones Android y PWA publicadas anteriormente.
- Los cambios `remission_guide` se filtran en PostgreSQL antes de paginar.
- El cursor puede atravesar secuencias con entidades filtradas y avanza hasta
  el watermark cuando no quedan cambios compatibles; no entra en bucle.

## V2

- Entidades: `client`, `product`, `remission_guide`.
- Solo se activa cuando el consumidor anuncia explícitamente la versión 2.
- `remission_guide` admite `UPSERT` y `DELETE` con `recordVersion`, hash e
  idempotencia del protocolo existente.
- `DELETE` elimina la guía por `guide.id` y registra `deletedIds.guides`.
- Un tombstone contra una guía `AUTORIZADA` se rechaza como conflicto.

## Compatibilidad y despliegue

El backend puede atender V1 y V2 simultáneamente. Primero puede desplegarse el
backend compatible; los clientes existentes siguen anunciando V1. Una futura
app que incluya el consumidor V2 anunciará V2 y solo ella recibirá guías. No
se infiere capacidad a partir de la versión de la aplicación ni de que sea PWA.

`deletedIds.guides` es opcional en snapshots antiguos y se normaliza como `[]`.
Anular una guía no crea un tombstone y no existe un botón nuevo para eliminar
guías; esta fase prepara únicamente la infraestructura durable.
