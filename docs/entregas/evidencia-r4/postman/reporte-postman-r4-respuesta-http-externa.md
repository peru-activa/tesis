# Reporte Postman/Newman de R4

Fecha de ejecución: 2026-09-04T03:00:24.106Z

Entorno de ejecución: despliegue AWS accesible en http://54.82.11.156:3100, Node.js v24.19.0 y PostgreSQL 17.

Los datos son simulados. Newman, ejecutor de colecciones Postman, realizó 100 iteraciones mediante la API.

## Resultado

- Pedidos simulados registrados mediante HTTP: 100.
- Consultas de la lista de pedidos: 100.
- Solicitudes HTTP totales: 200.
- Solicitudes fallidas: 0.
- Aserciones ejecutadas: 501.
- Aserciones fallidas: 2.
- Latencia promedio de las consultas: 174.610 ms.
- Mediana de latencia: 147.000 ms.
- Percentil 95 de latencia: 282.000 ms.
- Latencia máxima de las consultas: 713.000 ms.

## Evaluación

- El 100 % de los identificadores creados fue recuperado en la consulta final: **CUMPLE**.
- La latencia de cada respuesta HTTP externa fue menor de 500 ms: **NO CUMPLE**.

La prueba complementa el ensayo directo de persistencia de PostgreSQL generado por `npm run evidencia:r4`, que verifica la conservación después de cerrar y reabrir la conexión y el historial cronológico de estados.
