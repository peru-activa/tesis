# Evidencia de persistencia de R4 en AWS

Fecha de ejecución: 3 de septiembre de 2026, hora de Lima.

Se utilizaron únicamente datos simulados. Antes del reinicio, PostgreSQL
contenía 100 pedidos y 100 entradas de historial. Se reinició el contenedor de
PostgreSQL, se esperó hasta que estuviera disponible y luego se reinició el
contenedor de la API.

Después del procedimiento, PostgreSQL conservó los 100 pedidos y las 100
entradas de historial. La API devolvió los mismos 100 pedidos. Por tanto, la
persistencia frente al reinicio de ambos servicios **CUMPLE**.

La ejecución remota reproducible quedó identificada por el comando de AWS
Systems Manager `0c770be0-4beb-4f81-89d4-0b3b27be2ee5`.
