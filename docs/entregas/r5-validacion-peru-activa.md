# Instrumento comparativo de los casos históricos de R5

Este instrumento corresponde a O2/R5. Utiliza veinte pedidos históricos
independientes de Gmail, anonimizados como H01-H20, para comparar una decisión
manual de Perú Activa con la propuesta automática.

El entregable para Perú Activa es un único documento de cinco páginas:

- páginas 1-2: decisión manual de talleres y conflictos, sin consultar el algoritmo;
- páginas 3-4: evaluación de la ruta automática, con plazo recibido, tiempo
  calculado por el algoritmo y margen disponible;
- página 5: cálculo final para determinar si se alcanzaron las metas de R5.

Archivo: [`evidencia-r5/r5-validacion-comparativa-peru-activa.pdf`](evidencia-r5/r5-validacion-comparativa-peru-activa.pdf).

## Reproducción

La propuesta del Paso 2 no se transcribe manualmente. Primero se ejecutan la
línea base determinística y el algoritmo genético sobre H01-H20; después, el
generador del PDF lee y valida directamente el JSON obtenido.

```bash
node --import tsx scripts/entregas/r5-historical-comparison.mjs \
  > docs/entregas/evidencia-r5/r5-resultados-algoritmo.json

uv run --with reportlab python scripts/entregas/build-r5-validation-packets.py
```

Artefactos reproducibles:

- `evidencia-r5/r5-resultados-algoritmo.json`: entradas normalizadas, versión
  del dataset, semilla, algoritmos, asignaciones y resumen calculado;
- `evidencia-r5/r5-validacion-comparativa-peru-activa.pdf`: instrumento único
  generado desde ese JSON.

La ejecución vigente usa el dataset `r5-historical-polos-gmail-v9-draft`, la
semilla `20260903`, la línea base `deterministic-baseline-0.6.0` y el algoritmo
genético `ga-0.6.0`. Ambos métodos obtuvieron diecinueve planes factibles, un
rechazo justificado y cero discrepancias de asignación. H04 se rechaza porque
Hydrotech no figura en el catálogo inmediato: los catorce días conservadores de
abastecimiento impiden cumplir el plazo de diez días, aunque la capacidad de
producción sí alcanza. Perú Activa revisó los veinte casos el 3 de septiembre
de 2026 y calificó como correctas las veinte propuestas, incluido el rechazo
justificado de H04. La coincidencia fue 20/20 (100 %) y las propuestas válidas
fueron 20/20 (100 %). La reducción porcentual de conflictos no es calculable:
la decisión manual registró cero conflictos y la propuesta automática también.

## Aplicación

1. Entregar o mostrar únicamente las páginas 1 y 2.
2. Perú Activa registra los talleres que habría elegido y los conflictos que
   habría previsto; el Paso 1 no solicita construir el flujo de procesos.
3. Una vez terminados los veinte casos, entregar o mostrar las páginas 3 y 4.
4. Perú Activa marca cada propuesta como correcta o incorrecta y explica solo
   los cambios necesarios.
5. Calcular la página 5 con los totales obtenidos. Esta hoja resume las marcas
   de las cuatro páginas revisadas y no exige una segunda evaluación.
6. Conservar la copia completada como evidencia privada y llevar a la tesis
   únicamente la versión anonimizada pertinente.

Cuando la fuente histórica no contiene un plazo, el documento muestra `No
indicado` y no calcula margen. La fecha técnica utilizada internamente permite
calcular la duración, pero no se atribuye al cliente.

Cada código H01-H20 se vincula con un registro privado que conserva los
identificadores de la fuente original. Ese registro, los correos originales y
el escaneo firmado no forman parte del repositorio. El JSON público conserva
solo la transcripción anonimizada y la huella SHA-256 del escaneo bajo custodia
privada.
