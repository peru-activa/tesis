# Evidencia técnica de R4: base de datos centralizada

Fecha de ejecución: 2026-09-04T15:11:10.478Z

Los datos utilizados son simulados. Esta prueba verifica la estructura y la persistencia de la solución; no representa una validación con clientes ni resultados del piloto.

## Resultado

- Pedidos creados: 100.
- Pedidos recuperados después de cerrar y reabrir la conexión: 100.
- Pedidos perdidos: 0.
- Integridad de almacenamiento: 100 %.
- Especificaciones técnicas de talleres almacenadas: 7.
- Historial verificado: recommended → assigned → in_production → completed.
- Pedidos con suma de tallas consistente: 100 de 100.
- Filas normalizadas: 400 tallas, 500 procesos, 188 capacidades de talleres, 1 asignación y 1 distribución.
- Integridad referencial: la clave foránea rechazó un historial sin pedido.
- Integridad de dominio: la restricción CHECK rechazó una cantidad de talla negativa.
- Integridad agregada: la restricción diferida rechazó una suma de tallas distinta de la cantidad del pedido.
- Límite de asignación: la base rechazó una cantidad de taller superior a la cantidad del pedido.
- Mayor latencia observada entre consultas frecuentes: 207.136 ms.

## Evaluación de los IOV

- 100 % de pedidos almacenados sin pérdida de datos: **CUMPLE**.
- Latencia de consultas frecuentes menor de 500 ms: **CUMPLE**.

El ensayo se ejecutó en un esquema PostgreSQL temporal y aislado. Al finalizar se eliminó exclusivamente dicho esquema para no mezclar los datos simulados con otros registros locales.
