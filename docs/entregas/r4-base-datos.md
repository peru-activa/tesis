# R4: base de datos centralizada

## Trazabilidad

- Objetivo: O1, portal para registrar pedidos estandarizados y consultar su seguimiento.
- Resultado: R4, base de datos centralizada con historial de pedidos y especificaciones técnicas de talleres.
- Medio de verificación: esquema SQL y reporte reproducible de almacenamiento y consultas.
- IOV: 100 % de pedidos almacenados sin pérdida y consultas frecuentes por debajo de 500 ms.
- EDT: EDT1311, módulo de pedidos.

## Implementación

PostgreSQL conserva tres estructuras relacionadas con R4:

- `thesis_orders`: estado actual y contenido completo de cada pedido.
- `thesis_order_status_history`: secuencia cronológica de estados por pedido.
- `thesis_workshops`: especificaciones técnicas validadas por el contrato de dominio, incluidas especialización, procesos, materiales, capacidad y disponibilidad.

La aplicación accede a pedidos y talleres mediante los contratos `OrderStore` y `WorkshopStore`. Al configurar `DATABASE_URL`, ambos usan PostgreSQL; el modo en memoria queda limitado a pruebas unitarias aisladas. Los datos iniciales de talleres son simulados y se insertan o actualizan de manera idempotente.

## Reproducción y evidencia

Con PostgreSQL 17 disponible y `DATABASE_URL` configurada:

```bash
npm run evidencia:r4
```

El comando crea un esquema temporal aislado, registra 100 pedidos simulados y las especificaciones de los talleres, cierra la conexión, vuelve a abrirla y comprueba que no exista pérdida. Después mide 100 ejecuciones de cuatro consultas frecuentes. Solo genera el reporte si ambos IOV se cumplen; finalmente elimina el esquema temporal creado por la propia prueba.

Los resultados quedan en `docs/entregas/evidencia-r4/reporte-r4.md` y `reporte-r4.json`.

## Alcance

Esta evidencia demuestra la implementación y el comportamiento técnico de R4. No atribuye métricas a clientes, talleres ni al piloto. Los pedidos que se produzcan durante el piloto poblarán la misma estructura sin que R4 dependa de disponer de información histórica previa.
