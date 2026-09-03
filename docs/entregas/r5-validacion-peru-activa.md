# Instrumento de revisión de los casos históricos de R5

Estado: aplicado con la dueña de Perú Activa el 3 de septiembre de 2026. La
empresa comunicó conformidad con las veinte decisiones: diecisiete asignaciones
factibles y tres rechazos. La copia completada debe preservarse como evidencia
privada y todavía debe consolidarse el cálculo de conflictos del proceso manual.

Este instrumento corresponde a O2/R5. Los casos H01-H20 son veinte correos
históricos independientes y anonimizados. No contienen nombres de clientes,
correos, teléfonos ni identificadores internos. Los veinte registros
exploratorios anteriores (18 de WhatsApp y 2 de Gmail sin el mismo paquete de
trazabilidad) fueron retirados del dataset y no participan en esta aplicación.
La revisión no sustituye el piloto final.

Cada código H01-H20 se vincula por separado con un registro privado de
trazabilidad que conserva el cliente, canal, fecha, título e identificadores de
la fuente original. Ese registro no forma parte del entregable anonimizado.
Los nombres de talleres también se sustituyen por los códigos A-G en los
artefactos públicos; la correspondencia real permanece fuera del repositorio.

Los formularios imprimibles se encuentran en
[`evidencia-r5/r5-validacion-paso-1-decision-manual.pdf`](evidencia-r5/r5-validacion-paso-1-decision-manual.pdf)
y
[`evidencia-r5/r5-validacion-paso-2-propuesta-algoritmo.pdf`](evidencia-r5/r5-validacion-paso-2-propuesta-algoritmo.pdf).
Se regeneran con
`uv run --with reportlab python scripts/entregas/build-r5-validation-packets.py`.

## Aplicación

1. Perú Activa revisa primero las entradas y registra qué decisión habría tomado
   manualmente, sin consultar la propuesta automática.
2. Después compara su decisión con la propuesta calculada y marca `correcta` o
   `incorrecta`.
3. Si la propuesta es incorrecta, registra el taller o proceso que cambiaría y
   la razón concreta: especialización, capacidad, disponibilidad, plazo u otra.
4. Confirma o corrige también quién compra la tela, si se requiere molde nuevo y
   los plazos calculados a partir de las capacidades registradas.

## Primera pasada: decisión manual

| Caso | Entrada anonimizada                                                  | Decisión manual de Perú Activa | Conflictos observados |
| ---- | -------------------------------------------------------------------- | ------------------------------ | --------------------- |
| H01  | 50 polos básicos, jersey de algodón 30/1, estampado                  | Pendiente                      | Pendiente             |
| H02  | 300 polos, poliéster, estampado                                      | Pendiente                      | Pendiente             |
| H03  | 180 polos publicitarios, algodón pyme, estampado                     | Pendiente                      | Pendiente             |
| H04  | 4000 polos deportivos, Hydrotech, sublimado                          | Pendiente                      | Pendiente             |
| H05  | 100 polos básicos, algodón 30/1, estampado                           | Pendiente                      | Pendiente             |
| H06  | 188 polos deportivos, Dry Fit, estampado                             | Pendiente                      | Pendiente             |
| H07  | 110 polos camiseros, franela 20/1 60/40, cuatro bordados             | Pendiente                      | Pendiente             |
| H08  | 25 polos básicos, algodón reactivo 20/1, bordado                     | Pendiente                      | Pendiente             |
| H09  | 50 polos deportivos, Inter Dryer, sublimado                          | Pendiente                      | Pendiente             |
| H10  | 100 polos deportivos, Dry Fit Premium, sin personalización indicada  | Pendiente                      | Pendiente             |
| H11  | 167 polos camiseros, algodón, dos bordados                           | Pendiente                      | Pendiente             |
| H12  | 1000 polos camiseros, piqué de algodón 24/1                          | Pendiente                      | Pendiente             |
| H13  | 100 polos camiseros, piqué de algodón 24/1, dos bordados             | Pendiente                      | Pendiente             |
| H14  | 116 polos camiseros, Jacquard, dos bordados                          | Pendiente                      | Pendiente             |
| H15  | 2731 polos básicos, interlock 59 % pima y 41 % poliéster, bordado    | Pendiente                      | Pendiente             |
| H16  | 50 polos deportivos, Hydrotech, sublimado y bordado                  | Pendiente                      | Pendiente             |
| H17  | 60 polos deportivos, Dry Fit de poliéster, sublimado                 | Pendiente                      | Pendiente             |
| H18  | 30 polos deportivos, microfibra, sublimado                           | Pendiente                      | Pendiente             |
| H19  | 178 polos camiseros, piqué Lacoste reactivo, técnica no especificada | Pendiente                      | Pendiente             |
| H20  | 410 polos deportivos, Poly Tricot, técnica no especificada           | Pendiente                      | Pendiente             |

## Segunda pasada: evaluación de la propuesta automática

| Caso | Propuesta de ambos métodos                                                                       | Veredicto de Perú Activa | Razón o corrección |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------------ | ------------------ |
| H01  | Taller A                                                                                         | Pendiente                | Pendiente          |
| H02  | Sin asignación: “poliéster” no identifica una calidad compatible con los productores registrados | Pendiente                | Pendiente          |
| H03  | Taller A                                                                                         | Pendiente                | Pendiente          |
| H04  | Sin asignación: la cantidad excede la capacidad registrada dentro del plazo                      | Pendiente                | Pendiente          |
| H05  | Taller A                                                                                         | Pendiente                | Pendiente          |
| H06  | Taller B                                                                                         | Pendiente                | Pendiente          |
| H07  | Taller A + Taller G                                                                              | Pendiente                | Pendiente          |
| H08  | Taller A + Taller F                                                                              | Pendiente                | Pendiente          |
| H09  | Taller B + Taller D                                                                              | Pendiente                | Pendiente          |
| H10  | Taller B                                                                                         | Pendiente                | Pendiente          |
| H11  | Taller A + Taller G                                                                              | Pendiente                | Pendiente          |
| H12  | Taller A                                                                                         | Pendiente                | Pendiente          |
| H13  | Taller A + Taller G                                                                              | Pendiente                | Pendiente          |
| H14  | Sin asignación: no existe productor camisero registrado para Jacquard                            | Pendiente                | Pendiente          |
| H15  | Taller A + Taller G                                                                              | Pendiente                | Pendiente          |
| H16  | Taller B + Taller D + Taller F                                                                   | Pendiente                | Pendiente          |
| H17  | Taller B + Taller D                                                                              | Pendiente                | Pendiente          |
| H18  | Taller B + Taller D                                                                              | Pendiente                | Pendiente          |
| H19  | Taller A                                                                                         | Pendiente                | Pendiente          |
| H20  | Taller B                                                                                         | Pendiente                | Pendiente          |

## Datos inferidos que requieren confirmación

- En los veinte casos se aplicó provisionalmente la regla de que Perú Activa
  compra la tela en pedidos grandes o telas especiales y el taller la compra en
  pedidos rutinarios.
- En los veinte casos se asumió un molde estándar porque la fuente no decía si
  el modelo era nuevo.
- H05 usa las 100 unidades de la tabla contractual; el nombre del archivo fuente
  menciona 130 unidades y la contradicción debe ser confirmada.
- H06 usa Dry Fit, una de las alternativas permitidas en la fuente.
- H07 conserva la composición indicada en la tabla técnica, aunque el título de
  la fuente menciona piqué de algodón.
- H09, H16 y H18 representan únicamente el componente polo de solicitudes que
  también incluían otras prendas.
- H10 y H20 usan una de las telas alternativas expresamente permitidas por sus
  fuentes para reproducir la evaluación.
- H11 aplica bordado porque la fuente lo recomienda, pero Perú Activa debe
  confirmar que esa técnica corresponde a su decisión real.
- H19 no agrega un proceso de personalización porque la técnica del logotipo no
  fue especificada.
- H10, H16, H17, H19 y H20 usan plazos provisionales; existen cinco casos cuyo
  plazo requiere confirmación.

La conformidad comunicada equivale preliminarmente a 17 de 17 asignaciones
factibles aprobadas y 3 de 3 rechazos aprobados. El IOV de reducción de
conflictos se calcula por separado con las respuestas del primer formulario. Una
coincidencia entre los dos algoritmos no se cuenta como validación humana.
