# Diseño del incremento de asignación multicanal · Semana 3

## Trazabilidad

| Elemento | Alcance del incremento |
| --- | --- |
| Objetivo específico | O2: implementar la asignación automática de pedidos a talleres externos. |
| Resultados | R5, R7 y R8 parciales. |
| Medio de verificación | Código fuente, contrato HTTP, interfaz ejecutable, eventos Socket.io y pruebas automatizadas. |
| IOV preparado | Factibilidad, coincidencia de procesos, restricciones incumplidas y reproducibilidad con datos simulados. |
| EDT | Diseño de arquitectura/contratos e interfaz; avance conectado de EDT1312 y EDT1313. |
| Semana | Semana 3 del ciclo 2026-2. |
| Evidencia | Dataset `r5-synthetic-v1`, ocho escenarios, pruebas y demostración local. |

Este incremento no demuestra los IOV finales de R5. No utiliza datos históricos
autorizados, no implementa todavía el algoritmo genético final y no reporta
resultados del piloto.

## Actor y necesidad

**Actor principal:** responsable de Perú Activa que confirma la propuesta de
asignación calculada por el sistema.

**Actor receptor:** taller proveedor seleccionado, representado por una bandeja
web local sin autenticación.

**Necesidad:** evaluar talleres bajo las mismas restricciones, confirmar la
propuesta fuera del motor y publicar una representación consistente del pedido
en la web del taller y en una vista previa local de WhatsApp.

## Caso de uso UC-R1/R7-00: recibir la solicitud y convertir la aceptación

1. El cliente envía el formulario y la API registra `COT-XXXXXXXX`.
2. El servidor publica `quotation.updated`; la solicitud aparece en la cola de
   Perú Activa sin recargar el dashboard.
3. Perú Activa registra manualmente la cotización.
4. El cliente acepta o rechaza.
5. Si acepta una cotización de una sola prenda, el backend adapta los campos,
   crea `PED-XXXXXXXX` y ejecuta automáticamente la línea base de asignación.
6. El servidor publica `order.updated`; Perú Activa ve inmediatamente la
   propuesta o la ausencia explicada de un taller factible.
7. Si hay varias prendas, la cotización permanece visible con estado
   `requires_scope_decision`; no se decide silenciosamente si dividirla.

La clasificación provisional de la tela cotizada se encuentra en
`quotation-order-adapter.ts`: reconoce algodón/pima/piqué/lacoste/jersey,
dry-fit/deportivo y poliéster/Zanetti/Microtec/Win. Una denominación desconocida
se conserva y será descartada de forma explicable si ningún taller la atiende.

## Caso de uso UC-R7-01: confirmar y publicar una asignación

### Precondiciones

- Existe una cotización aceptada de una sola prenda o un escenario que la representa.
- El pedido contiene producto, material, cantidad, procesos y fecha requerida.
- Los talleres y el pedido están rotulados como simulados.

### Flujo principal

1. Perú Activa selecciona un escenario reproducible.
2. La API valida la entrada y ejecuta la línea base heurística.
3. El motor descarta talleres inviables y ordena los elegibles.
4. La interfaz muestra la propuesta, sus factores y las razones de descarte.
5. Perú Activa confirma un taller que pertenece a la lista de candidatos.
6. La API guarda la asignación y construye una notificación canónica.
7. La proyección web queda publicada para el taller.
8. Se genera una vista previa local de WhatsApp con los mismos datos operativos.
9. Socket.io publica el pedido actualizado y las vistas abiertas se refrescan.

### Flujos alternativos

- Si no existe un taller elegible, la API devuelve las razones y no crea una
  asignación.
- Si se intenta confirmar un taller descartado, la API rechaza la operación.
- Si se reinicia el servicio sin PostgreSQL, los datos temporales se pierden.

## Reglas y estados

- El cálculo no incluye intervención humana.
- La confirmación humana ocurre después del cálculo y no altera sus puntajes.
- La bandeja del taller no expone puntajes ni datos de talleres competidores.
- La vista de WhatsApp se marca `preview_only`; no se simula entrega o lectura.
- `recommended` significa propuesta calculada y `assigned` significa propuesta
  confirmada por Perú Activa.
- Toda proyección incluye el mismo identificador y versión del pedido.

## Contrato canónico de notificación

La fuente de verdad es `PortalOrder`. El backend deriva una sola notificación
con los campos que ambos canales pueden presentar:

- código de pedido;
- taller elegido;
- producto, material, color y cantidad;
- procesos requeridos y referencia de diseño;
- fecha y distrito de entrega;
- fecha de confirmación;
- versión y procedencia simulada.

La web presenta el contenido completo. La proyección de WhatsApp lo convierte
en texto estructurado sin consultar ni duplicar reglas de negocio.

## Dataset reproducible

`r5-synthetic-v1` contiene cinco talleres ficticios y ocho pedidos de frontera:

1. polo equilibrado;
2. prenda deportiva con sublimación;
3. especialización en bordado;
4. buzo con procesos integrados;
5. capacidad exactamente en el límite;
6. capacidad insuficiente;
7. plazo incompatible;
8. material sin cobertura.

Los escenarios usan la fecha de evaluación fija
`2026-08-27T09:00:00-05:00` y la semilla declarada `20260827`. La línea base
no consume aleatoriedad, pero la semilla queda en el contrato para la futura
comparación con el algoritmo genético.

## Decisiones pendientes

- Definir si una cotización con varias prendas puede dividirse entre talleres.
- Validar factores y pesos con Perú Activa.
- Implementar y comparar el algoritmo genético durante T09.
- Sustituir la vista previa por el adaptador real de WhatsApp después de aprobar
  canal, plantilla, datos y credenciales.
- Incorporar autenticación antes de cualquier uso fuera del entorno local.
