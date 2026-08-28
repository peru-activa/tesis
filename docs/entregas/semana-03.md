# Entrega Semana 3

## Trazabilidad

| Elemento              | Alcance de esta entrega                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| Objetivos             | O1 y avance conectado de O2                                                |
| Resultados            | R1, R5, R7 y R8 parciales                                                  |
| EDT                   | EDT1210, EDT1220, EDT1240 y avance de EDT1311-EDT1313                      |
| Medio de verificación | Formulario ejecutable, flujo visual, contrato HTTP y pruebas automatizadas |
| IOV de R1             | Se prepara la matriz de cobertura; todavía no se declara el 100 % validado |

## Caso de uso UC-R1-01: solicitar una cotización

**Actor principal:** cliente de Perú Activa.

**Necesidad:** comunicar un requerimiento de polos con información
suficiente para que Perú Activa prepare una cotización.

**Precondición:** el cliente conoce la prenda, cantidad, tallas, color, diseño o
personalización, fecha y lugar de entrega. Si desconoce la tela, puede solicitar
una propuesta.

**Flujo principal:**

1. El cliente agrega uno o más tipos de polo.
2. Registra variante, cantidad y distribución de tallas.
3. Registra color, personalización, número de aplicaciones y referencia visual.
4. Elige una tela conocida o solicita una propuesta.
5. Registra fecha, lugar de entrega y datos de contacto.
6. Revisa el resumen y envía la solicitud.
7. El sistema genera el código de seguimiento; el cliente nunca lo ingresa.
8. Perú Activa define manualmente tela propuesta, precio y condiciones.
9. El cliente acepta o rechaza la cotización.
10. Solo al aceptarla se confirma el pedido y puede comenzar la asignación de
    taller.

## Reglas acordadas

- El sistema no calcula automáticamente el precio de venta.
- Perú Activa actúa como vendedor y define la cotización.
- El cliente comprador acepta o rechaza la cotización.
- El color es obligatorio porque puede modificar el costo de la tela.
- La tela puede quedar como `solicitar propuesta`; Perú Activa la concreta en
  la cotización.
- El número de logos, bordados o estampados se registra porque modifica el
  precio.
- La fecha y el lugar de entrega son obligatorios.
- Para esta entrega se emplean únicamente datos simulados.

## Criterios de aceptación de R1 parcial

- El formulario admite provisionalmente polos y sus variantes.
- La suma de cantidades por talla coincide con la cantidad total.
- No se puede enviar sin color, fecha, lugar de entrega o contacto.
- La tela desconocida no bloquea la solicitud y queda identificada como una
  propuesta pendiente.
- El código de seguimiento se genera en el servidor.
- La solicitud queda pendiente de cotización y no ejecuta todavía la asignación.
- El precio solo aparece después de la acción manual de Perú Activa.
- La aceptación del cliente ocurre después de la cotización.

## Evidencia esperada

- Archivo BPMN `docs/process/solicitud-cotizacion.bpmn`.
- Formulario React visible en el portal.
- React Hook Form usa el mismo esquema Zod que valida la API, sin duplicar las
  reglas del formulario.
- Pruebas del registro, la cotización manual y la respuesta del cliente.
- Flujo reproducible mediante `npm run entrega:semana3`.

La interfaz está separada en `QuotationRequestForm`, `QuotationFlowBoard` y
componentes visuales compartidos. Esta separación permite presentar y probar el
registro, la cotización y la decisión como incrementos identificables.

## Limitaciones

Los tipos y campos provienen de una entrevista inicial y todavía deben validarse
formalmente con Perú Activa y los clientes piloto. La simulación no demuestra el
IOV final de R1 ni los indicadores del piloto. La carga binaria de diseños, el
algoritmo genético y la comparación de algoritmos permanecen pendientes.

## Incremento conectado R5/R7/R8: formulario, asignación y canales

Las solicitudes enviadas desde `/nueva-solicitud` aparecen automáticamente en la
cola del dashboard de Perú Activa mediante la invalidación
`quotations.changed` y una nueva consulta autorizada. Después de
aceptar una cotización de una sola prenda, el backend crea la orden de
producción y ejecuta la evaluación sin una acción adicional.

El motor filtra cinco talleres simulados por producto, tela exacta, procesos,
capacidad, disponibilidad y plazo. Si un taller no cubre la cantidad, evalúa
planes de dos y, solo después, de tres talleres. Perú Activa confirma
humanamente un plan y el backend crea una notificación por taller con la
cantidad que le corresponde; esa información alimenta la bandeja web y la
vista previa local de WhatsApp.

### Reproducción

1. Ejecutar `npm run dev`.
2. Abrir `/demo`; comprobar que el backend reconoce el rol y redirige al
   cliente a `/mis-pedidos`. Abrir `/nueva-solicitud` y enviar una solicitud
   simulada. El backend registra
   como propietario el correo de la sesión local o de Cloudflare Access.
3. Abrir `/mis-pedidos` y comprobar que la solicitud aparece en
   el historial del mismo cliente y no en el de otro correo simulado.
4. Ingresar con el correo operativo; comprobar que `/demo` redirige a
   `/peru-activa` y que la solicitud aparece
   como `Nueva` sin recargar.
5. Seleccionar `Abrir y cotizar`; comprobar que el detalle reutiliza el mismo
   resumen visual revisado por el cliente, incluidas las imágenes de la prenda
   y la tela. Ingresar el precio unitario de cada tipo de prenda y comprobar
   que el servidor calcula el total antes de enviar la cotización.
6. Regresar al detalle de `Mis pedidos` y aceptar la cotización.
7. Comprobar que se crea `PED-XXXXXXXX` y se muestran los talleres evaluados.
8. Confirmar uno e ingresar a `/taller` con el teléfono del
   taller elegido. Marcar `En producción` y luego `Terminado`; comprobar que el
   cliente ve ambos cambios en el mismo detalle.

La simulación manual de escenarios no aparece en la bandeja operativa de Perú
Activa. Se conserva únicamente en `/evidencia-r5` para reproducir
la evidencia técnica de R5 sin confundirla con solicitudes recibidas.

El diseño y las limitaciones están documentados en
`docs/design/asignacion-multicanal-semana-03.md`; el proceso se representa en
`docs/process/asignacion-notificacion-multicanal.bpmn`.

### Estado y limitaciones

Este incremento mantiene R5, R7 y R8 en estado `parcial`. Conecta técnicamente
formulario, aceptación, orden y dashboard para cotizaciones de una sola prenda.
Las cotizaciones con varias prendas quedan en `requires_scope_decision`, pues
todavía no se ha decidido si deben asignarse juntas o por separado. Tampoco se
compara aún con el algoritmo genético, no se validan IOV con datos históricos o
participantes y no se envían mensajes reales por WhatsApp.

Cloudflare Access quedó integrado con el patrón de validación JWT de OpenTextil.
El 27/08/2026, con autorización expresa, se creó la publicación temporal
`pedidos.opentextil.com`, protegida mediante código enviado al correo. El
origen continúa siendo local y no constituye el despliegue AWS comprometido.
Los cinco teléfonos de taller siguen siendo identidades simuladas: no
demuestran autenticación segura y requieren un OTP real antes de uso operativo.

### Verificación local de persistencia

El 27/08/2026 se conectó el backend de desarrollo a PostgreSQL 17 local mediante
el archivo ignorado `.env`. Se creó la solicitud simulada `COT-7B6E10A6`, se
comprobó su fila en `thesis_quotation_requests`, se reinició completamente el
backend y la API volvió a entregar la misma solicitud. Esta prueba demuestra la
persistencia técnica local del flujo; no constituye validación del piloto ni de
los IOV con participantes.
