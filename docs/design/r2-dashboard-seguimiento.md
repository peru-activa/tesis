# Diseño de R2: dashboard de seguimiento del cliente

## Trazabilidad

| Elemento | Alcance |
| --- | --- |
| Objetivo | O1: portal para registrar pedidos e integrar seguimiento en tiempo real |
| Resultado | R2: dashboard operativo de seguimiento en tiempo real para clientes |
| Medio de verificación | Imágenes del dashboard en funcionamiento; registro de accesos y tiempos de respuesta |
| IOV 1 | El 100 % de pedidos registrados debe ser visible; la verificación final se realiza con el usuario |
| IOV 2 | La actualización visible debe tardar menos de dos segundos; la verificación final se realiza con el usuario |
| EDT | EDT1313: visualización y logs en tiempo real; prueba técnica adicional con 100 usuarios concurrentes |
| Evidencia técnica | Pruebas de aislamiento y persistencia, cobertura registrado/visible, carga concurrente, medición en navegador, capturas y manifiesto con huellas |

## Actor y necesidad

El actor principal es el cliente autenticado de Perú Activa. Necesita confirmar que su solicitud fue registrada, consultar la cotización acordada, entender en qué etapa se encuentra el pedido y saber si debe realizar una acción. No debe conocer identificadores internos ni acceder a pedidos de otra identidad.

Perú Activa y los talleres son actores secundarios. Sus cambios de cotización, asignación y producción alimentan el dashboard, pero no comparten datos completos mediante Socket.io: el evento solo indica que existe un cambio y el cliente vuelve a consultar la API con su propia autorización.

## Casos de uso y criterios de aceptación

### UC-R2-01 Listar mis pedidos

1. La API resuelve la identidad del cliente.
2. Consulta únicamente sus solicitudes en `quotation_requests`.
3. Consulta en `orders` solamente los pedidos enlazados mediante `source_quotation_id`.
4. Devuelve cada solicitud una vez, incluso cuando tenga más de una orden de producción.
5. La interfaz muestra estado, fecha solicitada, última actualización y precio cuando exista.

Se acepta cuando dos clientes con solicitudes distintas reciben conjuntos disjuntos y cuando la comparación entre solicitudes registradas y elementos visibles resulta exacta.

### UC-R2-02 Consultar el detalle y actuar

1. El cliente abre una solicitud propia.
2. La API devuelve cotización, órdenes asociadas, historial fechado y última actualización.
3. La interfaz muestra el estado actual, la siguiente acción, la fecha solicitada y la cotización conservada.
4. Si la cotización está pendiente, informa que Perú Activa debe enviarla.
5. Si la cotización está enviada, el cliente puede aceptarla o rechazarla.
6. Si el pedido está en producción, informa desde cuándo; si terminó, informa la fecha del cambio.

Se acepta cuando una solicitud ajena responde como no encontrada, una cotización aceptada sigue mostrando su precio y cada cambio persistido aparece con fecha.

### UC-R2-03 Recibir una actualización

1. Perú Activa o un taller cambia el estado mediante la API autorizada.
2. El backend persiste el cambio y emite una señal Socket.io.
3. El navegador autenticado vuelve a consultar el detalle.
4. React confirma el render del nuevo `updatedAt` mediante un marcador observable.

Se acepta técnicamente cuando el tiempo desde la respuesta confirmada del cambio hasta el marcador renderizado es menor de dos segundos en todas las repeticiones de evidencia. La verificación con usuario se registra por separado.

## Reglas y excepciones

- `quotation_requests` es la fuente de identidad, solicitud y cotización.
- `orders.source_quotation_id` relaciona la producción con la solicitud.
- `order_status_history` es la fuente del historial de producción.
- La cotización permanece visible después de aceptarse o rechazarse.
- `requiredBy` se presenta como fecha solicitada. Una fecha estimada solo puede mostrarse si existe una fuente operativa distinta.
- `lastUpdatedAt` es el máximo entre la actualización de la solicitud y las órdenes asociadas.
- El historial combina eventos verificables de solicitud, cotización, decisión e historial de producción; se ordena por fecha y no inventa etapas.
- Si Socket.io se desconecta, la interfaz informa reconexión y recarga al restablecerse.
- Los estados de carga, vacío y error explican qué puede hacer el cliente.

## Contrato de seguimiento

`GET /v1/my-orders` devuelve elementos resumidos. `GET /v1/my-orders/{quotationId}` devuelve el mismo núcleo con historial completo.

```ts
interface CustomerTrackingItem {
  quotation: QuotationRequest;
  productionOrders: Array<{
    id: string;
    status: ProductionOrderStatus;
    updatedAt: string;
    assignment?: OrderAssignment;
    history: Array<{ status: ProductionOrderStatus; occurredAt: string }>;
  }>;
  lastUpdatedAt: string;
  timeline: Array<{
    key: string;
    label: string;
    occurredAt: string;
    status: 'complete' | 'current';
  }>;
}
```

La lista puede omitir `history` y `timeline` para evitar consultas innecesarias; el detalle los incluye. El contrato nunca incorpora información perteneciente a otro propietario.

## Plan visual

**Color.** Se conserva la identidad existente de Perú Activa: tinta `#17243A`, rojo `#C5212E`, verde de avance `#28715C`, papel `#F4F6F8`, línea `#D7DEE8` y ámbar operativo `#D89B3D`.

**Tipografía.** Inter mantiene la lectura operativa; Georgia se reserva para el encabezado principal ya existente. Las fechas y acciones usan Inter con cifras tabulares para que puedan compararse.

**Composición.** El detalle abre con estado, última actualización y siguiente acción. Debajo aparece una ruta de producción horizontal inspirada en una línea de costura: un único hilo continuo se llena hasta la etapa actual. Después se muestran cotización e historial, y finalmente las especificaciones enviadas.

```text
┌ Estado actual ───────────── Última actualización ┐
│ explicación                  fecha y hora         │
│ Siguiente paso: acción concreta                   │
└───────────────────────────────────────────────────┘

  ✓ Confirmado ━━━ ◉ Taller asignado ─── ○ Producción ─── ○ Terminado

┌ Cotización conservada ┐  ┌ Historial fechado ┐
│ precio y condiciones  │  │ fecha · cambio    │
└────────────────────────┘  └────────────────────┘

┌ Especificaciones enviadas ────────────────────────┐
└────────────────────────────────────────────────────┘
```

**Movimiento.** Solo la etapa actual pulsa suavemente y el hilo se anima cuando cambia el estado. No se animan tarjetas ni se repiten entradas decorativas. `prefers-reduced-motion: reduce` elimina pulso y transiciones.

**Accesibilidad.** El progreso usa una lista ordenada con texto visible, `aria-current="step"` y estado no dependiente del color. El foco de enlaces y botones es visible. Fechas y acciones se expresan con texto completo.

## Revisión del plan visual

La primera idea podía convertirse en un conjunto genérico de tarjetas SaaS. Se corrigió concentrando la jerarquía en una ruta de producción continua que recuerda el hilo del proceso textil y manteniendo el resto de la página sobrio. El movimiento se limita a la etapa actual porque comunica actividad real; no se añaden animaciones dispersas. El dashboard conserva la identidad visual ya demostrada y cambia únicamente la información y el indicador que ayudan al cliente a decidir.
