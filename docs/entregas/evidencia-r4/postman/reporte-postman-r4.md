# Reporte Postman/Newman de R4

Fecha de ejecución: 2026-09-04T05:46:15.375Z

Entorno de ejecución: despliegue AWS accesible en http://18.234.234.167:3100, Node.js v26.7.0 y PostgreSQL 17.

Los datos son simulados. Newman, ejecutor de colecciones Postman, realizó 100 iteraciones mediante la API. La latencia del IOV corresponde al tiempo de la consulta ejecutada por el servicio desplegado y se obtuvo del encabezado estándar `Server-Timing`. La latencia HTTP externa se presenta por separado porque también incorpora la red entre el ejecutor y AWS.

## Resultado

- Pedidos simulados registrados mediante HTTP: 100.
- Consultas de la lista de pedidos: 100.
- Solicitudes HTTP totales: 200.
- Solicitudes fallidas: 0.
- Aserciones ejecutadas: 601.
- Aserciones fallidas: 0.
- Latencia promedio de consulta en el servidor: 8.823 ms.
- Mediana de consulta en el servidor: 8.369 ms.
- Percentil 95 de consulta en el servidor: 13.069 ms.
- Latencia máxima de consulta en el servidor: 26.464 ms.
- Latencia HTTP externa promedio: 147.640 ms.
- Percentil 95 de latencia HTTP externa: 201.000 ms.
- Latencia HTTP externa máxima: 373.000 ms.

## Evaluación

- El 100 % de los identificadores creados fue recuperado en la consulta final: **CUMPLE**.
- Cada consulta medida dentro del servicio desplegado fue menor de 500 ms: **CUMPLE**.

La prueba complementa el ensayo directo de persistencia de PostgreSQL generado por `npm run evidencia:r4`, que verifica la conservación después de cerrar y reabrir la conexión y el historial cronológico de estados.
