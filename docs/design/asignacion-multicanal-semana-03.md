# Diseño del incremento de asignación multicanal · Semana 3

## Trazabilidad

| Elemento              | Alcance del incremento                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| Objetivo específico   | O2: implementar la asignación automática de pedidos a talleres externos.                                  |
| Resultados            | R5, R7 y R8 parciales.                                                                                    |
| Medio de verificación | Código fuente, contrato HTTP, interfaz ejecutable, eventos Socket.io y pruebas automatizadas.             |
| IOV preparado         | Factibilidad, coincidencia de procesos, restricciones incumplidas y reproducibilidad con datos simulados. |
| EDT                   | Diseño de arquitectura/contratos e interfaz; avance conectado de EDT1312 y EDT1313.                       |
| Semana                | Semana 3 del ciclo 2026-2.                                                                                |
| Evidencia             | Dataset `r5-synthetic-v15`, nueve escenarios, pruebas y demostración local.                               |

Este incremento no demuestra los IOV finales de R5. No utiliza datos históricos
autorizados ni reporta resultados del piloto. Sí implementa una comparación
reproducible entre la línea base y un algoritmo genético con datos simulados.

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
5. Perú Activa confirma un plan calculado de uno, dos o tres talleres.
6. La API guarda la asignación y construye una notificación por taller con su cantidad.
7. La proyección web queda publicada únicamente para los talleres asignados.
8. Se genera una vista previa local de WhatsApp con los mismos datos operativos.
9. Socket.io publica el pedido actualizado y las vistas abiertas se refrescan.

### Flujos alternativos

- Si ningún taller cubre el pedido, la API evalúa primero combinaciones de dos
  talleres y luego de tres; si aún no existe capacidad suficiente, devuelve las
  razones y no crea una asignación.
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

## Caso de uso UC-R5-02: comparar los métodos de asignación

1. El evaluador selecciona uno de los nueve escenarios versionados.
2. La API construye una única entrada con pedido, cuatro productores, cuatro
   proveedores de proceso, restricciones y pesos.
3. La línea base determinística evalúa la entrada y registra su tiempo medio.
4. El algoritmo genético usa la misma entrada y la semilla `20260827`.
5. Cada cromosoma representa una combinación de uno a tres talleres; el
   decodificador determinístico distribuye las cantidades dentro de la
   combinación y las soluciones inviables reciben aptitud cero.
6. La población de 36 individuos evoluciona durante 40 generaciones mediante
   selección por torneo, cruce uniforme, mutación de 0.12 y elitismo de dos.
7. La interfaz compara factibilidad, asignación, aptitud y tiempo, y muestra la
   mejor aptitud y el promedio de la población por generación.
8. El evaluador exporta un JSON con entrada, parámetros, resultados y traza.

Los tiempos son mediciones observadas, no constantes del algoritmo. La línea
base se repite 100 veces y el algoritmo genético cinco veces para reportar el
promedio de cada ejecución sin ocultar su diferencia de costo computacional.

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

`r5-synthetic-v15` contiene cuatro productores y cuatro proveedores de proceso
declarados por Perú Activa, además de nueve pedidos
de frontera:

1. polo equilibrado;
2. prenda deportiva con sublimación;
3. especialización en bordado;
4. Piqué Lacoste especializado;
5. capacidad exactamente en el límite;
6. capacidad productiva insuficiente;
7. plazo incompatible;
8. material sin cobertura;
9. sublimación y bordado combinados sobre una prenda deportiva.

Los escenarios usan la fecha de evaluación fija
`2026-08-27T09:00:00-05:00` y la semilla declarada `20260827`. La línea base no
consume aleatoriedad y el algoritmo genético sí utiliza la semilla para producir
la misma población, convergencia y asignación ante la misma entrada.

Cada escenario registra quién compra la tela. Si compra el taller productor,
el motor exige que pueda gestionar el aprovisionamiento; si compra Perú Activa,
el taller solo debe poder trabajar la tela especificada. Esta decisión humana
se conserva como entrada y ambos métodos reciben exactamente el mismo valor.

La compatibilidad de materiales se evalúa por familias de capacidad. Los
talleres A y B pueden confeccionar polos de algodón y deportivos, pero no
prendas de licra; esta última familia permanece separada. Las telas concretas
se conservan como ejemplos y trazabilidad. Por ejemplo, Win, Dry Fit, Zanetti e
Hydrotech pertenecen a la familia deportiva. Una tela desconocida solo coincide
si el taller la declaró explícitamente.

El pedido consulta un catálogo versionado de telas principales y complementos
para polos con disponibilidad inmediata. Si una calidad no figura en ese
catálogo, el motor asume de forma conservadora un abastecimiento de siete a
catorce días y utiliza catorce días pendientes para comprobar el plazo. La
espera puede reducirse únicamente cuando Perú Activa confirma stock o una
compra anticipada.

El taller H atiende exclusivamente polos publicitarios básicos de algodón. Su
compatibilidad se limita a las telas declaradas y no se extiende a Pima, piqué,
camiseros, deportivos ni licra, aunque pertenezcan a una familia relacionada.

La capacidad técnica y la capacidad productiva se almacenan por separado. Para
un pedido sublimado, el motor puede construir una ruta superpuesta. El perfil de
calandra recibe tela, prepara el diseño digital, imprime el papel de
transferencia, sublima y corta; después el
productor cose y realiza el acabado. El perfil declarado del taller E requiere
piezas ya cortadas y registra 1,000 polos sublimados por semana. También ofrece
vinil con una capacidad declarada de 500 polos por semana; el proceso incluye
impresión y pelado o limpieza del material. Estos perfiles no amplían por sí
mismos los cinco participantes comprometidos para el piloto.

Los otros dos perfiles representan talleres de bordado declarados. El taller F registra
cuatro cabezales y una capacidad máxima de 100 logos diarios; incluye limpieza
del bordado y retiro del pelón. El taller G registra doce cabezales y una capacidad
de 300 logos diarios. Cada perfil separa el total de cabezales, los cabezales
disponibles y la capacidad.

El formulario del cliente no contiene talleres, cabezales ni capacidades. Solo
recoge las condiciones del pedido y permite varias personalizaciones. El motor
usa internamente esos datos para construir rutas como sublimación, corte,
bordado sobre panel, costura y acabado. Cuando el modelo es nuevo, el patronaje
se asigna al mismo taller productor; los modelos estándar usan moldes existentes.

En las rutas especializadas, la capacidad se prorratea durante los días
laborables disponibles. El plazo se aproxima mediante el mayor tiempo efectivo
de las etapas, porque los lotes parciales pasan al siguiente proveedor sin
esperar que termine el pedido completo. Los talleres A y B registran una
capacidad máxima de 2,000 polos cada uno por seis días laborables. El taller H
registra 10,000 polos publicitarios básicos de algodón por el mismo periodo.

La fecha de evaluación representa el momento en que el diseño fue aprobado. El
plazo productivo se calcula desde ese instante y no vuelve a sumar el tiempo de
aprobación comercial del diseño.

En los escenarios factibles, ambos métodos producen una asignación y
la misma puntuación calculada sobre una referencia común. En los tres escenarios
incompatibles, ambos métodos reportan ausencia de solución. Este resultado no
prueba que el algoritmo genético sea superior; documenta su comportamiento y
evita seleccionar el método definitivo sin comparación.

## Decisiones pendientes

- Definir si una cotización con varias prendas puede dividirse entre talleres.
- Validar factores y pesos con Perú Activa.
- Contrastar ambos métodos con datos históricos cuando exista autorización y
  seleccionar el método definitivo con base en esa evidencia.
- Sustituir la vista previa por el adaptador real de WhatsApp después de aprobar
  canal, plantilla, datos y credenciales.
- Incorporar autenticación antes de cualquier uso fuera del entorno local.
