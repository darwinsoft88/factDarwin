# Reset controlado de secuencial de prueba

Usar solo para documentos de prueba, anulados o rechazados. En produccion real, si un comprobante fue enviado al SRI, no reutilices el numero sin revisar el caso contable y tributario.

## Tablas afectadas

- `sales`: documento principal.
- `sale_items`: lineas del documento.
- `document_sequences`: reserva oficial del secuencial por empresa, documento, ambiente, establecimiento y punto de emision.
- `saas_snapshots`: copia JSON que la app carga al iniciar.
- `saas_snapshot_history`: respaldo automatico del snapshot anterior.
- `audit_log`: registro tecnico del reset.

## Probar sin aplicar

Desde `backend`:

```bash
node src/tools/resetTestSaleSequence.js --company-id=co-1778704993458-b96dbd40c99b --establishment=001 --emission-point=001 --sequence=6
```

El script muestra lo que haria, pero no cambia nada.

## Aplicar reset

```bash
node src/tools/resetTestSaleSequence.js --company-id=co-1778704993458-b96dbd40c99b --establishment=001 --emission-point=001 --sequence=6 --apply
```

Por defecto deja el proximo secuencial en `1`. Para dejar otro valor:

```bash
node src/tools/resetTestSaleSequence.js --company-id=co-1778704993458-b96dbd40c99b --establishment=001 --emission-point=001 --sequence=6 --next-sequential=10 --apply
```

## Reglas de seguridad

- Solo permite estados `RECHAZADA` y `ANULADA` por defecto.
- Hace respaldo en `saas_snapshot_history` antes de modificar.
- Ejecuta todo dentro de una transaccion.
- Si encuentra movimientos de inventario relacionados, se detiene. Si confirmas que es prueba, puedes agregar `--remove-inventory`.
