# R2: dashboard operativo de seguimiento para clientes

## Trazabilidad

- Objetivo específico: O1.
- Resultado: R2, dashboard operativo de seguimiento en tiempo real para clientes.
- Medio de verificación: imágenes del dashboard en funcionamiento; registro de accesos y tiempos de respuesta.
- IOV 1: 100 % de pedidos registrados visibles en el dashboard, con verificación conjunta con el usuario.
- IOV 2: tiempo de actualización menor de dos segundos, con verificación conjunta con el usuario.
- EDT1313: dashboard y registros de actualización; prueba complementaria con 100 usuarios concurrentes.

## Desarrollo técnico

El dashboard conserva las rutas existentes `/mis-pedidos` y
`/mis-pedidos/:quotationId`. La API identifica al cliente, consulta en
PostgreSQL únicamente sus solicitudes y recupera las órdenes relacionadas por
`orders.source_quotation_id`. El control se repite en la consulta de detalle;
una solicitud perteneciente a otra identidad se responde como inexistente.
Las rutas de detalle mal formadas regresan a la lista del cliente y la ruta
exploratoria `/portal` redirige al formulario vigente `/nueva-solicitud`, de
modo que el prototipo anterior no queda expuesto dentro del flujo de R2.

La solicitud conserva la cotización comercial después de su aceptación. El
detalle muestra el precio y sus condiciones durante la asignación y la
producción. También presenta la fecha y hora de la última actualización, la
fecha solicitada de entrega, una acción siguiente según el estado y una línea
de tiempo fechada. La interfaz no denomina fecha estimada a la fecha solicitada
ni calcula una previsión que el sistema todavía no pueda sustentar.

El progreso se implementó como una lista ordenada con cuatro etapas. La etapa
actual usa `aria-current="step"`; los estados se comunican mediante texto,
íconos y color. El conector y el pulso breve hacen visible el avance cuando el
usuario permite movimiento. `prefers-reduced-motion` evita la animación cuando
el sistema operativo solicita reducirla. Para esta visualización categórica se
usaron HTML y CSS semánticos en vez de una librería de gráficos: así cada etapa
mantiene nombre, estado y orden disponibles para tecnologías de asistencia.

Los cambios se propagan mediante señales Socket.io sin datos del pedido. Al
recibir `orders.changed` o `quotations.changed`, el navegador vuelve a consultar
la API con su propia identidad y React renderiza los datos vigentes. PostgreSQL
conserva el estado y `order_status_history` conserva sus fechas.

## Verificación reproducible

Con PostgreSQL local disponible y `DATABASE_URL` configurada:

```bash
npm run evidencia:r2
```

El comando compila la aplicación, rechaza conexiones de escritura cuyo host no
sea local, crea un esquema temporal aislado y registra doce solicitudes
simuladas de tres clientes. Luego cotiza y acepta las doce solicitudes, verifica
las doce órdenes normalizadas, abre cada dashboard con Chromium y compara los
identificadores persistidos con los renderizados. Finalmente ejecuta cambios de
estado visibles y una carga de Artillery antes de eliminar el esquema temporal.

La ejecución auditada obtuvo:

| Verificación | Resultado | Criterio |
| --- | ---: | ---: |
| Pedidos registrados visibles | 12/12 (100 %) | 100 % |
| Registros ajenos visibles | 0 | 0 |
| Detalle perteneciente a otro cliente | HTTP 404 | Acceso bloqueado |
| Actualizaciones visibles medidas | 8 | — |
| Máxima latencia visible | 648.141 ms | < 2000 ms |
| Usuarios virtuales Artillery completados | 100/100 | 100 concurrentes |
| Usuarios virtuales fallidos | 0 | 0 |
| Máxima respuesta de carga | 5 ms | < 2000 ms |
| Tablas normalizadas verificadas | 12 | 12 |
| Tablas `thesis_*` | 0 | 0 |

La latencia visible comienza antes de enviar el cambio de estado y termina
cuando Chromium observa en el DOM el nuevo `updatedAt`, después de persistir,
emitir la señal, volver a consultar y renderizar. Se distingue de la latencia
HTTP informada por Artillery.

Los resultados completos están en `docs/entregas/evidencia-r2/reporte-r2.json`,
las métricas de carga en `artillery-r2.json` y las huellas SHA-256 en
`manifest-sha256.json`. Las cuatro capturas muestran la lista, el estado
asignado, el estado terminado y el diseño móvil.

## Estado y limitaciones

La evidencia con datos simulados demuestra técnicamente el funcionamiento de
R2 y el cumplimiento técnico de ambos umbrales. No constituye una validación
del piloto. El estado es `demostrado`; para pasar a `validado`, los usuarios
reales deben comprobar conjuntamente que observan todos sus pedidos y que los
cambios aparecen dentro de dos segundos en las condiciones del piloto.

No se modificó AWS durante esta ejecución. El esquema probado fue el modelo
normalizado de R4 y el esquema temporal local se eliminó al finalizar.
