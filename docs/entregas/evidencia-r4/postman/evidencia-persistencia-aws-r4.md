# Evidencia de persistencia de R4 en AWS

Fecha de ejecución: 2026-09-04T15:17:38.847Z

Se utilizaron únicamente datos simulados. Antes del reinicio, PostgreSQL contenía 400 pedidos y 400 entradas de historial. Se reinició el contenedor de PostgreSQL, se esperó hasta que estuviera disponible y luego se reinició el contenedor de la API.

Después del procedimiento, PostgreSQL conservó los 400 pedidos y las 400 entradas de historial. La API devolvió los mismos 400 pedidos. La recuperación fue de 100 % y, por tanto, la persistencia frente al reinicio de ambos servicios **CUMPLE**.

El despliegue contiene 12 tablas de R4, 11 claves foráneas, 36 restricciones de comprobación y 23 índices. El catálogo contiene 0 objetos relacionales con el prefijo provisional anterior.

La ejecución remota reproducible quedó identificada por el comando de AWS Systems Manager `9d2b3a76-21e9-4a6a-a80f-58afd04289d2`. La imagen desplegada fue `479494991128.dkr.ecr.us-east-1.amazonaws.com/tesis-r4-api@sha256:65abfeb8a891dd6925a52dc039b7c54dfd29583223af2490bbe00fe464705354`.
