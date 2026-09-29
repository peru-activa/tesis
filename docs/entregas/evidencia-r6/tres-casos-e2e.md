# R6: tres casos de integración de extremo a extremo

**Alcance académico:** O2/R6, EDT1312 y T12 (T10 en cronograma), semana 7.
**Medio:** API Swagger, estado PostgreSQL, recibos de Meta y webhook firmado.
**IOV:** 100 % de los casos de integración definidos completan la asignación y
el envío por WhatsApp. El denominador de esta prueba es tres. La aceptación
operativa y el avance se registran por separado del IOV.

Los tres pedidos y talleres son ficticios. El único destinatario real es el
teléfono de prueba autorizado, `+51 956 285 912`. El remitente es el WhatsApp
público de Perú Activa, `+51 904 658 133`. No se usa Larico ni IA. No se
contacta a proveedores reales.

| Caso | Pedido y condiciones | Acción esperada en WhatsApp | Evidencia exigida |
| --- | --- | --- | --- |
| R6-E2E-01 | Confección, tela y tallas definidas; compra de tela por el taller. | `Tengo capacidad` → ficha técnica → `Acepto el pedido` → consulta de avance → `En proceso`. | Confirmación humana, `wamid` de las tres plantillas y de la ficha, botones vinculados por `context.id`, estado final `in_progress`, mismo pedido en la bandeja web. |
| R6-E2E-02 | Pedido distinto con taller simulado. | `No disponible` en la consulta inicial. | `wamid` de consulta, respuesta correlacionada, estado `capacity_no`, sin ficha ni orden enviados. |
| R6-E2E-03 | Pedido distinto con diseño PNG simulado para sublimación. | `Tengo capacidad` → ficha y PNG original → `No puedo asumirlo` en la orden. | Hash y archivo PNG de prueba, recibos de ficha/archivo/orden, respuesta correlacionada, estado `declined`, sin inicio de producción. |

## Procedimiento reproducible

1. Crear un pedido simulado por caso. Registrar el ID visible, versión del
   dataset, candidato y comprador de tela. Para el tercer caso, adjuntar un PNG
   simulado a la solicitud antes de aceptar la cotización.
2. Confirmar el plan desde el rol de Perú Activa. Comprobar que la API y la
   bandeja web conservan el mismo pedido y la misma distribución por taller.
3. Consultar `GET /v1/orders/{id}/production-coordination`. Anotar solo IDs
   de recibos y estados, nunca tokens ni datos de otros chats.
4. Pulsar el botón indicado desde el teléfono de prueba. Verificar que el
   webhook firmado registra el remitente y el `context.id` correspondiente al
   `wamid` de esa fase. Consultar nuevamente el estado.
5. Repetir la confirmación de cada plan y comprobar que no se crea otra
   asignación ni otro envío. Verificar que un botón de otro pedido o de otro
   número no cambia el estado.

## Registro de ejecución

Pendiente de ejecución real. No se atribuye éxito a las pruebas unitarias ni a
los envíos aislados de las tres plantillas realizados antes de la integración.
Para cerrar cada caso se registrarán fecha, SHA desplegados, IDs de pedido y
taller ficticio, estados, recibos de Meta, resultado observado en el teléfono de
prueba y comprobación de la bandeja web. La recepción deberá confirmarla Kevin.
