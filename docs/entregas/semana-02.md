# Entrega Semana 2

## Alcance demostrado

Esta entrega presenta un avance parcial de R5 y R8. Un escenario simulado y
versionado contiene un pedido de 100 polos y tres talleres candidatos. El motor
descarta alternativas que incumplen restricciones obligatorias y ordena las
elegibles mediante factores y pesos explícitos.

## Reproducción

Requiere Node.js 24. Desde la raíz de `codigo/`:

```bash
npm install
npm run entrega:semana2
```

El comando verifica tipos, pruebas y compilación; después abre
`http://localhost:5173/demo/semana-2`.

## Evidencia esperada

- El escenario muestra un pedido y tres talleres simulados.
- Dos talleres cumplen todas las restricciones.
- Taller C se descarta por procesos faltantes.
- Taller B ocupa el primer lugar y muestra puntaje, dimensiones y pesos.
- Dos ejecuciones consecutivas producen exactamente el mismo resultado.

## Relación con la tesis

| Resultado | Estado | Evidencia de esta entrega |
| --- | --- | --- |
| R5 | Parcial | Filtro de factibilidad y ranking determinístico explicable. |
| R8 | Parcial | Pruebas del filtrado, ordenamiento, descarte y reproducibilidad. |

## Limitaciones

El motor de esta entrega es la línea base heurística. Todavía no implementa el
algoritmo genético prometido como resultado final de R5, no usa datos históricos
reales y no demuestra indicadores del piloto. La asignación operativa continúa
sujeta a confirmación humana posterior al cálculo.
