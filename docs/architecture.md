# Arquitectura del MVP

## Flujo funcional

```text
Cliente
  -> portal React: registra especificaciones
  -> API Express: valida y guarda el pedido
  -> motor determinístico: filtra y ordena talleres
  -> Perú Activa: confirma el taller recomendado
  -> PostgreSQL: conserva pedido, asignación e historial
  -> Socket.io: actualiza el seguimiento del cliente
```

## Componentes

- `web/`: portal React + TypeScript + Tailwind CSS.
- `web/src/modules/quotation/`: formulario con React Hook Form, cotización
  manual y respuesta del cliente en componentes independientes.
- `src/app.ts`: API de pedidos, recomendaciones y confirmación.
- `src/application/quotation-service.ts`: reglas de transición del flujo de
  cotización, independientes de Express y React.
- `src/http/quotation-routes.ts`: contrato HTTP de solicitudes, cotizaciones y
  decisiones.
- `src/infrastructure/quotation-store.ts`: persistencia en memoria o PostgreSQL.
- `src/domain/`: contratos, restricciones y ranking determinístico.
- `src/data/`: talleres simulados y adaptadores de persistencia.
- `db/schema.sql`: tablas PostgreSQL de pedidos e historial.
- `/docs`: documentación Swagger del contrato HTTP.

## Persistencia

`OrderStore` separa la aplicación de la infraestructura. En modo demostración
se usa `MemoryOrderStore`; al definir `DATABASE_URL`, se activa
`PostgresOrderStore` con las mismas operaciones. Esto permite usar datos
simulados sin convertir una estructura temporal en la base definitiva.

## Reglas de decisión

- Las restricciones se verifican antes de calcular el ranking.
- Especialización, material, procesos, capacidad, volumen y plazo pueden
  descartar un taller.
- El resultado expone entrega, costo, puntualidad, calidad y evidencia.
- La fecha de evaluación y la versión forman parte del cálculo reproducible.
- La asignación final exige confirmación humana fuera del motor.

## Correspondencia inicial con resultados

- R1: formulario estandarizado de producto, material, tallas, diseño y entrega.
- R2: seguimiento operativo de los pedidos registrados.
- R4: esquema PostgreSQL y adaptador de persistencia.
- R5: algoritmo funcional de recomendación.
- R7: portal integrado con el algoritmo mediante API REST.
- R8: pruebas unitarias e integradas del flujo.

Esta correspondencia representa avance técnico. La validación con clientes y
talleres piloto sigue siendo necesaria para declarar cada resultado completo.
