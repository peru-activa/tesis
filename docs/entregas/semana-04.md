# Entrega Semana 4

## Trazabilidad

| Elemento | Alcance |
| --- | --- |
| Objetivo | O1 |
| Resultado | R2 técnicamente demostrado |
| EDT | EDT1313, dashboard de seguimiento |
| Medio | Capturas del dashboard, registro de acceso y tiempos |
| Evidencia | `docs/entregas/evidencia-r2/` |

## Incremento demostrable

El cliente registra una solicitud mediante el contrato usado por el formulario,
la solicitud y su orden se guardan en las tablas normalizadas de R4, y el mismo
cliente observa la cotización, el progreso, las fechas, el historial y la
siguiente acción. Las actualizaciones de producción llegan mediante Socket.io
y una consulta nuevamente autorizada.

La ejecución reproducible confirmó 12/12 pedidos visibles, aislamiento entre
tres identidades, ocho actualizaciones visibles con un máximo de 648.141 ms y
100/100 usuarios virtuales completados sin fallos. Los datos son simulados.

## Limitación pendiente

Los dos IOV exigen además verificación conjunta con el usuario. Esa intervención
real sigue pendiente y es el único requisito que separa a R2 del estado
`validado`.
