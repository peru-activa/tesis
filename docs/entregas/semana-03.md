# Entrega Semana 3

## Trazabilidad

| Elemento | Alcance de esta entrega |
| --- | --- |
| Objetivos | O1 y avance conectado de O2 |
| Resultados | R1, R5, R7 y R8 parciales |
| EDT | EDT1210, EDT1220, EDT1240 y avance de EDT1311-EDT1313 |
| Medio de verificación | Formulario ejecutable, flujo visual, contrato HTTP y pruebas automatizadas |
| IOV de R1 | Se prepara la matriz de cobertura; todavía no se declara el 100 % validado |

## Caso de uso UC-R1-01: solicitar una cotización

**Actor principal:** cliente de Perú Activa.

**Necesidad:** comunicar un requerimiento de polos o buzos con información
suficiente para que Perú Activa prepare una cotización.

**Precondición:** el cliente conoce la prenda, cantidad, tallas, color, diseño o
personalización, fecha y lugar de entrega. Si desconoce la tela, puede solicitar
una propuesta.

**Flujo principal:**

1. El cliente selecciona polo o buzo.
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

- El formulario admite los tipos provisionales `polo` y `buzo`.
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
