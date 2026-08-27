# Portal de pedidos de Perú Activa

Producto mínimo viable de la tesis: un portal para registrar pedidos textiles
estandarizados, recomendar talleres mediante criterios explícitos, confirmar la
asignación humanamente y consultar el seguimiento del pedido.

## Stack declarado en la tesis

- React + TypeScript + Tailwind CSS para el portal.
- Node.js + Express para la API REST.
- PostgreSQL mediante `pg` para pedidos e historial de estados.
- Socket.io para actualizaciones en tiempo real.
- Swagger UI para documentar la API.

El algoritmo no usa modelos generativos: aplica restricciones obligatorias y
un ranking determinístico con dimensiones y pesos visibles.

## Inicio rápido

Requiere Node.js 24.

```bash
npm install
npm run verify
npm run dev
```

Para reproducir directamente el avance verificable de Semana 2:

```bash
npm run entrega:semana2
```

Este comando ejecuta la verificación y abre una mesa de asignación interna con
datos simulados. Su alcance y limitaciones están documentados en
[`docs/entregas/semana-02.md`](docs/entregas/semana-02.md).

Para reproducir el formulario y el flujo de cotización manual de Semana 3:

```bash
npm run entrega:semana3
```

La demostración separa la solicitud del cliente, el precio definido por Perú
Activa y la aceptación o rechazo posterior. Su alcance está documentado en
[`docs/entregas/semana-03.md`](docs/entregas/semana-03.md).

Durante el desarrollo:

- Portal React: `http://localhost:5173`
- API Express: `http://localhost:3100`
- Swagger UI: `http://localhost:3100/docs`

Para probar el artefacto compilado:

```bash
npm run build
npm start
```

El portal queda disponible en `http://localhost:3100/portal`.

## PostgreSQL

Sin `DATABASE_URL`, el piloto conserva pedidos temporalmente en memoria. Con
PostgreSQL disponible:

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://tesis:tesis_local@localhost:5434/tesis npm run dev
```

El esquema reproducible está en [`db/schema.sql`](db/schema.sql). Los datos de
la demostración son simulados y están rotulados como tales en el portal.

## Verificación

`npm run verify` ejecuta el control de dependencias, tipos del backend y
frontend, pruebas del algoritmo y del flujo integrado, y ambos builds.

Consulta [la arquitectura](docs/architecture.md) y [la integración prevista con
la web pública](docs/production-integration.md). El estado verificable de R1-R13
se mantiene en [`docs/resultados.md`](docs/resultados.md).
