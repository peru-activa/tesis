# Evidencia de persistencia de R4 en AWS

Fecha de ejecución: 2026-09-04T05:58:59.165Z

Se utilizaron únicamente datos simulados. Antes del reinicio, PostgreSQL contenía 300 pedidos y 300 entradas de historial. Se reinició el contenedor de PostgreSQL, se esperó hasta que estuviera disponible y luego se reinició el contenedor de la API.

Después del procedimiento, PostgreSQL conservó los 300 pedidos y las 300 entradas de historial. La API devolvió los mismos 300 pedidos. La recuperación fue de 100 % y, por tanto, la persistencia frente al reinicio de ambos servicios **CUMPLE**.

El despliegue contiene 12 tablas de R4, 11 claves foráneas, 36 restricciones de comprobación y 23 índices.

La ejecución remota reproducible quedó identificada por el comando de AWS Systems Manager `b24ff174-d929-42d5-b89e-8d517f8a7b92`. La imagen desplegada fue `479494991128.dkr.ecr.us-east-1.amazonaws.com/tesis-r4-api@sha256:b1e4e12ff6d9768d81f0bf2cfa32bd9b57006fafb2da2df84f399cd7ef38277e`.
