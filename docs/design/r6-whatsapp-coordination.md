# R6: coordinación de producción por WhatsApp (diseño de integración)

## Trazabilidad y límite de la prueba

| Elemento | Decisión vigente |
| --- | --- |
| Objetivo y resultado | O2, R6: módulo integrado entre portal y algoritmo de asignación. |
| Medio e IOV | Contrato Swagger y pruebas de integración; el 100 % de los casos definidos debe completar asignación y envío por WhatsApp. El denominador aún debe fijarse antes de medirlo. |
| Método | API Express.js y webhooks en TypeScript, PostgreSQL, plantilla aprobada de Meta, pruebas de extremo a extremo. Sin IA para interpretar respuestas. |
| EDT y tarea | EDT1312 produce la propuesta del algoritmo. La integración está rotulada T12 en la EDT y T10 en el cronograma; registrar esta equivalencia hasta corregir la numeración documental. |
| Semana y evidencia | Semana 7, v98. Las tres plantillas `es_PE` están activas y fueron recibidas por el teléfono de prueba. Meta entregó un botón `Tengo capacidad` con `context.id` igual al recibo del mensaje de consulta. Esto aún no demuestra el IOV de R6. |

La prueba usa únicamente el teléfono autorizado de Kevin. Los contactos de los
talleres del dataset son ficticios y nunca son destinatarios de Meta. Ningún
envío a talleres reales se habilita por defecto.

## Caso de uso

1. El algoritmo calcula y explica una propuesta. No envía mensajes en esta etapa.
2. Perú Activa confirma un plan. La API conserva una sola asignación y crea una
   intención de comunicación por cada taller del plan, con un ID único.
3. El adaptador envía `proveedor_consulta_capacidad` al teléfono de prueba y
   guarda la respuesta de Meta. La bandeja web muestra por separado el estado
   de asignación y el estado de WhatsApp.
4. El taller pulsa `Tengo capacidad` o `No disponible`. El webhook verifica la
   firma y relaciona `context.id` con el recibo de la consulta. Solo esos botones
   cambian el estado de coordinación. Un texto libre no se interpreta como
   compromiso.
5. Si tiene capacidad, el sistema envía la ficha completa y los diseños
   originales disponibles, incluido PNG cuando exista, dentro de la ventana de
   atención abierta por la respuesta. Si falta un dato o archivo requerido, el
   flujo se detiene y muestra el faltante a Perú Activa.
6. Tras registrar la entrega de especificaciones, envía
   `proveedor_orden_produccion`. El botón `Acepto el pedido` vinculado al recibo
   de esa plantilla registra aceptación explícita; `No puedo asumirlo` registra
   rechazo. Ninguna respuesta inicia producción por sí sola sin que Perú Activa
   pueda ver el estado y los datos aceptados.
7. `proveedor_consulta_avance` consulta un pedido aceptado. Sus botones solo
   actualizan el avance de esa orden y no equivalen a una nueva aceptación.

## Contratos y garantías

- El envío se deduplica por `orderId`, `workshopId`, etapa y versión de la
  plantilla. Una llamada repetida a confirmar no crea otra asignación ni otro
  mensaje.
- Antes de llamar a Meta se registra una intención durable. Un timeout o un
  recibo ilegible deja el estado `delivery_unknown` y bloquea el reenvío
  automático. Un rechazo definitivo queda visible y requiere conciliación y
  una nueva decisión humana antes de otro intento.
- Se guarda el `wamid` de salida y se correlaciona el `context.id` de la
  respuesta entrante con el pedido y el taller previstos. El número de origen
  debe coincidir con el destinatario registrado. Los botones se comparan con
  valores cerrados y nunca se usan modelos o análisis semántico.
- Las respuestas del proveedor se registran como hechos operativos. Un clic
  prueba que ese número respondió a las condiciones enviadas; no constituye
  garantía legal ni multa automática. Perú Activa decide cuándo iniciar la
  producción ante una respuesta ambigua o un cambio de condiciones.
- El servicio público de Perú Activa sigue atendiendo clientes ordinarios. Un
  botón correlacionado con una consulta de taller se deriva al flujo de R6;
  los demás mensajes siguen su ruta actual. Larico no participa.
- El modo de prueba fija el destinatario en `+51 956 285 912` mediante un
  secreto de despliegue fuera del repositorio. Se valida el Phone Number ID
  público `881564971710283` antes de enviar. El modo real requiere, además,
  un teléfono verificado y consentimiento documentado por taller.

## Matriz de prueba

Los tres casos y sus criterios están fijados en
[`tres-casos-e2e.md`](../entregas/evidencia-r6/tres-casos-e2e.md). El denominador
del IOV para esta prueba técnica es tres. Un caso se cuenta como completado
solo tras la asignación persistida y el recibo de Meta de la consulta inicial;
las respuestas y fases posteriores se informan por separado.

## Evidencia pendiente

Se necesitan casos definidos y versionados, una confirmación humana por caso,
recibos de Meta, recepción en WhatsApp, correspondencia entre pedido y respuesta,
y comprobación de que el taller web ve la misma orden. La prueba aislada de las
plantillas y del botón no sustituye esta evidencia ni permite declarar R6
demostrado o validado.
