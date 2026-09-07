# Evidencia técnica de R2: dashboard de seguimiento

Fecha de ejecución: 2026-09-06T04:51:41.958Z

Los datos son simulados. La ejecución demuestra técnicamente R2 y deja pendiente la validación conjunta con usuarios indicada en ambos IOV. No se modificó AWS.

## Resultado

- Flujo verificado: formulario (contrato y endpoint de envío) → PostgreSQL normalizado → dashboard renderizado en Chromium.
- Solicitudes registradas y órdenes normalizadas: 12 de 12.
- Visibilidad: 12 de 12 pedidos, 100 %.
- Aislamiento: tres clientes observaron exclusivamente sus cuatro pedidos; una consulta de detalle ajeno respondió 404.
- Cotización: S/ 1,921.00 permaneció visible después de asignar y terminar el pedido.
- Historial visible: recomendado → taller asignado → en producción → terminado, con fechas.
- Mayor latencia visible de extremo a extremo: 648.141 ms, límite 2,000 ms.
- Carga: 100 de 100 usuarios virtuales completados, 0 fallidos; respuesta máxima 5 ms.
- Persistencia: doce tablas normalizadas verificadas; cero tablas `thesis_*`.

## Evaluación

- 100 % de pedidos registrados visibles: **CUMPLE en verificación técnica reproducible**.
- Actualización visible menor de dos segundos: **CUMPLE en verificación técnica reproducible**.
- Validación conjunta con usuarios: **PENDIENTE**.
