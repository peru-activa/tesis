# Arquitectura

## Límite del subsistema

El repositorio contiene únicamente el núcleo evaluable de la tesis:

1. recibe una instantánea estructurada del pedido y de los talleres candidatos;
2. aplica restricciones obligatorias;
3. calcula dimensiones comparables con pesos explícitos;
4. devuelve candidatos ordenados, razones y alternativas descartadas;
5. deja la selección y confirmación final a una persona.

La primera versión es un servicio HTTP sin estado. La persistencia de perfiles,
ejecuciones y métricas se añadirá detrás de puertos propios, sin acceder de
forma directa a la base de datos de otro sistema.

## Flujo

```text
Sistema consumidor
  -> instantánea de pedido y talleres
  -> API de tesis
  -> evaluación determinística
  -> candidatos + desglose + descartes
  -> confirmación humana en el sistema consumidor
```

## Reglas de diseño

- Los identificadores externos son referencias, no claves administradas aquí.
- La fecha de evaluación forma parte de la entrada para conservar
  reproducibilidad.
- Las restricciones obligatorias se evalúan antes del ranking.
- El puntaje nunca reemplaza el desglose ni las razones.
- Un cambio de pesos o reglas incrementará la versión del algoritmo.

