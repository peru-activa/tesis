# R4: base de datos centralizada

## Trazabilidad

- Objetivo: O1, portal para registrar pedidos estandarizados y consultar su seguimiento.
- Resultado: R4, base de datos centralizada con historial de pedidos y especificaciones técnicas de talleres.
- Medio de verificación: esquema SQL y reporte reproducible de almacenamiento y consultas.
- IOV: 100 % de pedidos almacenados sin pérdida y consultas frecuentes por debajo de 500 ms.
- EDT: EDT1311, módulo de pedidos.

## Implementación

PostgreSQL emplea un modelo relacional normalizado de forma moderada. Los
atributos consultados con frecuencia se almacenan en columnas y relaciones
explícitas, mientras que `payload` conserva una instantánea JSONB del objeto de
dominio para reconstruirlo sin pérdida. El modelo comprende:

- `quotation_requests` y `orders`: solicitud de origen, estado y
  datos principales del pedido.
- `order_sizes`, `order_processes` y
  `order_customizations`: detalles multivaluados del pedido.
- `order_status_history`: secuencia cronológica de estados.
- `workshops`, `workshop_capabilities` y
  `workshop_availability`: identidad, especificaciones técnicas,
  capacidad y disponibilidad de cada taller.
- `order_assignments`, `assignment_allocations` y
  `allocation_processes`: confirmación de la propuesta, distribución
  entre talleres y procesos asignados.

Las claves foráneas mantienen la trazabilidad entre solicitudes, pedidos,
talleres y asignaciones. Las restricciones `CHECK` protegen estados, dominios y
cantidades; los índices cubren las consultas recurrentes por estado, fecha,
capacidad y taller.

## Diseño físico resumido

| Tabla | Propósito | Clave primaria | Claves foráneas | Restricciones e índices principales | Contenido principal |
|---|---|---|---|---|---|
| `quotation_requests` | Conservar la solicitud comercial que origina uno o varios pedidos | `id` | — | `CHECK` de estado; índices por estado y propietario | Fechas, estado e instantánea de la solicitud |
| `orders` | Mantener el estado vigente y las especificaciones principales del pedido | `id` | `source_quotation_id` | `CHECK` de estado, producto, cantidad, personalización y tipo de polo; índices por estado y fecha requerida | Producto, cantidad, material, entrega, origen e instantánea íntegra |
| `order_sizes` | Descomponer la cantidad del pedido por talla | (`order_id`, `size`) | `order_id` | Cantidad no negativa; suma diferida igual a la cantidad del pedido | Talla y cantidad |
| `order_processes` | Preservar la secuencia de procesos requeridos | (`order_id`, `sequence`) | `order_id` | Proceso válido y único por pedido | Orden y nombre del proceso |
| `order_customizations` | Registrar una o varias personalizaciones | (`order_id`, `sequence`) | `order_id` | Tipo válido y único por pedido; aplicaciones positivas | Estampado, bordado, sublimado o vinil |
| `order_status_history` | Conservar el historial cronológico | `id` | `order_id` | Estado válido; índice (`order_id`, `occurred_at`) | Estado y fecha de ocurrencia |
| `workshops` | Identificar cada taller o proveedor de proceso | `id` | — | `CHECK` de teléfono, tipo y nivel de evidencia; índice por tipo | Identidad e instantánea de especificaciones |
| `workshop_capabilities` | Normalizar las capacidades multivaluadas del taller | (`workshop_id`, `capability_kind`, `capability_value`) | `workshop_id` | Tipo de capacidad válido; índice de búsqueda por tipo y valor | Productos, materiales, procesos, especialidades y días laborables |
| `workshop_availability` | Registrar capacidad, disponibilidad y métricas operativas | `workshop_id` | `workshop_id` | Rangos de capacidad, tasas entre 0 y 1 y costos no negativos | Capacidad, fecha disponible, plazo, costo y perfil especializado |
| `order_assignments` | Conservar la propuesta confirmada para un pedido | `order_id` | `order_id` | Una asignación vigente por pedido | Candidato confirmado y fecha |
| `assignment_allocations` | Vincular la asignación con los talleres participantes | (`order_id`, `workshop_id`) | `order_id`, `workshop_id` | Cantidad positiva que no supera el pedido; estado válido; índice por taller y estado | Taller, cantidad procesada y estado |
| `allocation_processes` | Determinar qué procesos ejecuta cada taller asignado | (`order_id`, `workshop_id`, `sequence`) | (`order_id`, `workshop_id`) | Proceso válido y único dentro de la distribución | Secuencia y proceso asignado |

El modelo no afirma una normalización absoluta. `orders.payload` y
`workshops.payload` conservan instantáneas JSONB de los objetos de
dominio para reconstrucción, auditoría y compatibilidad con versiones del
contrato. Los atributos utilizados para integridad, relaciones y consultas
frecuentes se almacenan además en columnas o tablas explícitas. La aplicación
escribe ambas representaciones dentro de una transacción, por lo que JSONB no
reemplaza las claves, restricciones ni relaciones del modelo.

La aplicación accede a pedidos y talleres mediante los contratos `OrderStore` y `WorkshopStore`. Al configurar `DATABASE_URL`, ambos usan PostgreSQL; el modo en memoria queda limitado a pruebas unitarias aisladas. Los datos iniciales de talleres son simulados y se insertan o actualizan de manera idempotente.

## Reproducción y evidencia

Con PostgreSQL 17 disponible y `DATABASE_URL` configurada:

```bash
npm run evidencia:r4
```

El comando crea un esquema temporal aislado, registra 100 pedidos simulados y
las especificaciones de los talleres, confirma una asignación, cierra la
conexión, vuelve a abrirla y comprueba que no exista pérdida. También verifica
la consistencia entre la cantidad total y el detalle por tallas, así como el
rechazo de una referencia huérfana y una cantidad negativa. Después mide 100
ejecuciones de cuatro consultas frecuentes. Solo genera el reporte si ambos
IOV se cumplen; finalmente elimina el esquema temporal creado por la propia
prueba.

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

La infraestructura incorpora una copia diaria mediante `pg_dump`
en un bucket Amazon S3 privado, cifrado con SSE-S3, versionado y con retención
de 35 días. El bucket tiene política de transporte TLS y permanece separado del
volumen EBS de PostgreSQL. La prueba `npm run evidencia:r4:backup` genera una
copia, verifica su checksum, la restaura en una base temporal, compara los
conteos con el origen y elimina la base temporal. El reporte se conserva en
`docs/entregas/evidencia-r4/backup/`.

La latencia de la consulta ejecutada en el servidor se expone mediante el
encabezado estándar `Server-Timing`; Newman la verifica contra el límite de 500
ms. El reporte conserva por separado el tiempo HTTP completo observado desde
el ejecutor externo, que también incluye la red. En la corrida final del 4 de
septiembre de 2026, hora de Lima, se registraron 200 solicitudes, 601
aserciones y 0 fallos. La consulta ejecutada en AWS presentó 12.159 ms de
promedio, 11.698 ms de mediana, 15.581 ms de percentil 95 y 24.363 ms como
máximo. La respuesta HTTP externa presentó 152.770 ms de promedio, 145 ms de
mediana, 186 ms de percentil 95 y 292 ms como máximo. Las 100 muestras de ambas
mediciones y su curva ECDF permanecen en el reporte reproducible.

Los reportes JSON, JUnit y Markdown quedan en
`docs/entregas/evidencia-r4/postman/`. La verificación adicional de persistencia,
ejecutada mediante `npm run evidencia:r4:persistence`, reinició ambos
contenedores y recuperó los mismos 400 pedidos y 400 registros de historial,
sin pérdida. La copia final se restauró con coincidencia exacta de 400 pedidos,
400 registros de historial, 7 talleres, 1600 filas de tallas y 188 capacidades.

## Alcance

Esta evidencia demuestra la implementación y el comportamiento técnico de R4
en un entorno desplegado. No atribuye métricas a clientes, talleres ni al
piloto. Los registros utilizados son simulados y están identificados como
tales. Los pedidos que se produzcan durante el piloto poblarán la misma
estructura sin que R4 dependa de información histórica previa.

La evidencia remota corresponde a la imagen inmutable
`sha256:65abfeb8a891dd6925a52dc039b7c54dfd29583223af2490bbe00fe464705354`.
Con este alcance, R4 quedó demostrado y sus dos IOV técnicos cumplieron. La
captura de datos reales del piloto pertenece a su ejecución posterior y no es
una condición previa de este resultado.
