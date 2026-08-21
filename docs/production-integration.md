# Integración con Perú Activa

## Responsabilidades

- PAS conserva la fuente de verdad de pedidos, proveedores, asignaciones y
  auditoría operativa.
- Este servicio administra únicamente el cálculo determinístico y, en una
  siguiente etapa, sus perfiles y métricas de evaluación.
- Larico puede iniciar el flujo mediante las herramientas tipadas de PAS, pero
  no entra al núcleo de la tesis ni modifica sus resultados.
- Una persona confirma el taller. PAS registra la asignación con su operación
  auditada existente.

## Integración prevista

```text
Larico o interfaz PAS
  -> herramienta tipada PAS
  -> adaptador HTTP PAS
  -> servicio de tesis
  -> candidatos explicados
  -> interfaz PAS
  -> confirmación humana
  -> order.assign_supplier
```

PAS enviará solo los campos necesarios y datos seudonimizados. El servicio no
recibirá credenciales de PAS ni acceso directo a su PostgreSQL. Los despliegues
del motor podrán beneficiar producción sin copiar el código entre repositorios;
PAS dependerá de una versión explícita del contrato HTTP.

