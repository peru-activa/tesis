# R4: base de datos centralizada

## Trazabilidad

- Objetivo: O1, portal para registrar pedidos estandarizados y consultar su seguimiento.
- Resultado: R4, base de datos centralizada con historial de pedidos y especificaciones técnicas de talleres.
- Medio de verificación: esquema SQL y reporte reproducible de almacenamiento y consultas.
- IOV: 100 % de pedidos almacenados sin pérdida y consultas frecuentes por debajo de 500 ms.
- EDT: EDT1311, módulo de pedidos.

## Implementación

PostgreSQL conserva tres estructuras relacionadas con R4:

- `thesis_orders`: estado actual y contenido completo de cada pedido.
- `thesis_order_status_history`: secuencia cronológica de estados por pedido.
- `thesis_workshops`: especificaciones técnicas validadas por el contrato de dominio, incluidas especialización, procesos, materiales, capacidad y disponibilidad.

La aplicación accede a pedidos y talleres mediante los contratos `OrderStore` y `WorkshopStore`. Al configurar `DATABASE_URL`, ambos usan PostgreSQL; el modo en memoria queda limitado a pruebas unitarias aisladas. Los datos iniciales de talleres son simulados y se insertan o actualizan de manera idempotente.

## Reproducción y evidencia

Con PostgreSQL 17 disponible y `DATABASE_URL` configurada:

```bash
npm run evidencia:r4
```

El comando crea un esquema temporal aislado, registra 100 pedidos simulados y las especificaciones de los talleres, cierra la conexión, vuelve a abrirla y comprueba que no exista pérdida. Después mide 100 ejecuciones de cuatro consultas frecuentes. Solo genera el reporte si ambos IOV se cumplen; finalmente elimina el esquema temporal creado por la propia prueba.

Los resultados quedan en `docs/entregas/evidencia-r4/reporte-r4.md` y `reporte-r4.json`.

El medio de verificación declarado como Postman se reproduce adicionalmente con
Newman. Para evaluar el servicio desplegado se configura la URL publicada por
CloudFormation:

```bash
R4_BASE_URL="$(aws cloudformation describe-stacks \
  --profile tesis-deployer \
  --region us-east-1 \
  --stack-name tesis-r4-demo \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiBaseUrl`].OutputValue' \
  --output text)" npm run evidencia:r4:postman
```

La colección `postman/r4-base-datos.postman_collection.json` registra 100
pedidos simulados, comprueba después de cada alta que todos los identificadores
creados puedan consultarse y mide 100 consultas. El despliegue reproducible usa
una instancia `t4g.micro` con contenedores separados para la API y PostgreSQL
17, un volumen cifrado de 10 GB y una regla de ingreso limitada a la dirección
IPv4 del ejecutor. No expone PostgreSQL ni habilita SSH. Sus plantillas se
encuentran en `infra/ecr.yaml`, `infra/demo.yaml` e `infra/deployer.yaml`.

La latencia de la consulta ejecutada en el servidor se expone mediante el
encabezado estándar `Server-Timing`; Newman la verifica contra el límite de 500
ms. El reporte conserva por separado el tiempo HTTP completo observado desde
el ejecutor externo, que también incluye la red. En la corrida del 3 de
septiembre de 2026, hora de Lima, se registraron 200 solicitudes, 601 aserciones y 0 fallos.
La consulta en AWS presentó 2.458 ms de promedio, 3.604 ms de percentil 95 y
6.405 ms como máximo. La respuesta HTTP externa presentó 152.470 ms de
promedio, 213 ms de percentil 95 y 416 ms como máximo.

Los reportes JSON, JUnit y Markdown quedan en
`docs/entregas/evidencia-r4/postman/`. La verificación adicional de persistencia
reinició ambos contenedores y recuperó los mismos 100 pedidos y 100 entradas de
historial; su salida se conserva en `evidencia-persistencia-aws-r4.md` y
`evidencia-persistencia-aws-r4.json`.

## Alcance

Esta evidencia demuestra la implementación y el comportamiento técnico de R4
en un entorno desplegado. No atribuye métricas a clientes, talleres ni al
piloto. Los registros utilizados son simulados y están identificados como
tales. Los pedidos que se produzcan durante el piloto poblarán la misma
estructura sin que R4 dependa de información histórica previa.
