# Integración prevista con Perú Activa

## Superficies

- `peruactiva.pe` continúa como web pública de la empresa.
- El portal de la tesis puede publicarse posteriormente en
  `pedidos.peruactiva.pe` o enlazarse desde una ruta de la web pública.
- El portal reutiliza la identidad visual de Perú Activa, pero conserva su
  despliegue y ciclo de pruebas independientes.

## Contrato

El navegador consume la API Express por HTTPS. En producción, la API utiliza
PostgreSQL y Socket.io; no se copian bases ni credenciales desde otros sistemas.
La documentación del contrato se publica en Swagger UI y su versión acompaña
las evidencias de la tesis.

## Datos

El MVP usa talleres y pedidos simulados. Los ensayos finales deberán usar casos
reales anonimizados y consentimiento cuando corresponda. Ninguna métrica
obtenida únicamente con simulaciones debe presentarse como resultado de una
prueba con usuarios reales.

## Despliegue

El despliegue se realizará solo después de autorizarlo expresamente, configurar
secretos fuera del repositorio, ejecutar `npm run verify` y verificar el mismo
SHA que se publique. La landing pública no se modifica como efecto lateral del
despliegue del portal.
