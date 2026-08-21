# Tesis

Subsistema determinístico para recomendar talleres externos a partir de las
características de un pedido, explicar los criterios evaluados y mantener la
decisión final bajo confirmación humana.

## Alcance

- Modelar pedidos, talleres, capacidades y disponibilidad.
- Descartar alternativas que incumplan restricciones obligatorias.
- ordenar candidatos mediante criterios y pesos explícitos.
- exponer el desglose de cada resultado para hacerlo auditable.
- medir tiempos, resultados y errores durante las pruebas piloto.

No forman parte del núcleo la interpretación de lenguaje natural, los modelos
generativos ni la ejecución automática de la asignación final.

## Inicio rápido

Requiere Node.js 24.

```bash
npm install
npm run verify
npm run dev
```

El servicio queda disponible en `http://localhost:3100`:

- `GET /health`
- `POST /v1/recommendations`

Consulta [la arquitectura](docs/architecture.md) y
[la integración con producción](docs/production-integration.md).

