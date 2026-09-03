# Evidencia técnica de R4: base de datos centralizada

Fecha de ejecución: 2026-09-03T17:51:19.010Z

Los datos utilizados son simulados. Esta prueba verifica la estructura y la persistencia de la solución; no representa una validación con clientes ni resultados del piloto.

## Resultado

- Pedidos creados: 100.
- Pedidos recuperados después de cerrar y reabrir la conexión: 100.
- Pedidos perdidos: 0.
- Integridad de almacenamiento: 100 %.
- Especificaciones técnicas de talleres almacenadas: 7.
- Historial verificado: recommended → assigned → in_production → completed.
- Mayor latencia observada entre consultas frecuentes: 5.531 ms.

## Evaluación de los IOV

- 100 % de pedidos almacenados sin pérdida de datos: **CUMPLE**.
- Latencia de consultas frecuentes menor de 500 ms: **CUMPLE**.

El ensayo se ejecutó en un esquema PostgreSQL temporal y aislado. Al finalizar se eliminó exclusivamente dicho esquema para no mezclar los datos simulados con otros registros locales.
