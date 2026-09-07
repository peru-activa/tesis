# Publicación con Cloudflare Access

Estado verificado: 6 de septiembre de 2026, zona horaria `America/Lima`.

## Actualización del 7 de septiembre de 2026

Se desplegó el commit
`61a41040af452dac7d68242b25ab0d66f8c08a78` mediante la imagen ARM64
inmutable
`sha256:a205e3661a7a20c12504acb9c3735ba79dac09e5aca0c31f7a9f4c6089667fe1`.
La ronda adapta el formulario a anchos de 320 a 430 px, elimina desbordes y
superposiciones, eleva los objetivos táctiles visibles a un mínimo de 44 px,
evita el zoom involuntario de controles en iOS e incorpora una pantalla de
recuperación cuando el frontend no puede iniciar. El origen, el túnel y
PostgreSQL aprobaron la verificación posterior; la imagen anterior permanece
detenida con el nombre `tesis-r4-api-rollback-f874f2f0`.

El incidente móvil descrito como pantalla en blanco después de ingresar un PIN
ocurre antes de que la aplicación intervenga. Cloudflare Access consume cada
PIN una sola vez y requiere iniciar y completar el acceso en la misma instancia
del navegador. Para evitar que una aplicación de correo abra un contexto sin
la cookie de la aplicación, el usuario debe abrir primero el dominio en Safari
o Chrome, solicitar un PIN nuevo y escribirlo una sola vez en esa misma pestaña.
La comprobación autenticada en un teléfono real continúa pendiente; no se
considera sustituida por las verificaciones locales ni por la respuesta del
origen.

Se desplegó la imagen ARM64 inmutable
`sha256:f874f2f020f3c30a6cb003dabdafb3ecf3aea94f20420ee61a008d2ad7d45386`
para reemplazar el campo libre de color por un selector nativo compacto con
muestra circular. El formulario conserva los colores escritos en solicitudes
anteriores y registra los nuevos tonos como valores hexadecimales. La imagen
anterior permanece detenida como reversión inmediata; el túnel y PostgreSQL
continuaron operativos durante la actualización.

Se desplegó la imagen inmutable
`sha256:48302257f1956ef59e057b96d533189725d224713739b0ef258281ce5f66a10e`
para permitir que una cuenta interna de Perú Activa use también la vista
personal de sus solicitudes y para hacer explícita la revisión de asignación
desde la bandeja operativa. La misma ronda conecta el hover y el foco de las
opciones de corte y manga con el preview lateral del formulario. Las consultas
personales continúan filtradas por el propietario autenticado. La imagen
anterior queda disponible como reversión inmediata; PostgreSQL y el conector de
Cloudflare no fueron reemplazados.

## Alcance

Esta publicación permite ejecutar el formulario y el seguimiento de pedidos
desde el dominio de OpenTextil. El origen se encuentra desplegado en AWS y no
modifica el POS ni su túnel productivo.

| Recurso            | Valor                                  |
| ------------------ | -------------------------------------- |
| Hostname           | `pedidos.opentextil.com`               |
| Aplicación Access  | `Peru Activa Pedidos - Tesis`          |
| ID de aplicación   | `2e32be23-e4d8-40d1-968f-58fc8c38759e` |
| Política           | `Clientes con código por correo`       |
| ID de política     | `c01cad13-7460-40a9-8940-5c97ce138348` |
| Túnel              | `tesis-pedidos-local`                  |
| ID de túnel        | `598d5ddf-432c-4e3c-8134-922272b5b96d` |
| DNS                | CNAME proxied hacia el túnel           |
| ID de registro DNS | `ed052d9348c4033e498b82f8f0214366`     |
| Origen             | `http://tesis-r4-api:3100`             |

## Autorización

- Access exige autenticación mediante el proveedor `Código por correo`.
- La política acepta correos válidos porque el portal está dirigido a clientes
  externos. Esto es deliberado y no se debe reutilizar para una aplicación
  interna.
- La API valida firma, emisor y audiencia del JWT antes de confiar en el correo.
- PostgreSQL filtra cada solicitud por su propietario verificado.
- Los correos internos configurados en `PERU_ACTIVA_EMAILS` obtienen el rol
  `peru_activa`; cualquier otro correo validado obtiene el rol `client`.
- Los talleres por teléfono permanecen como demostración local y no se publican
  como autenticación de producción.

## Operación

El API y `cloudflared` se ejecutan como contenedores en la red Docker
`tesis-r4`. El conector usa el token del túnel obtenido directamente desde
Cloudflare. El token no se guarda en el repositorio ni se documenta. El túnel
solo inicia conexiones salientes y no requiere abrir otro puerto público.

## Verificación ejecutada

- El túnel registró conexiones QUIC en Cloudflare.
- `https://pedidos.opentextil.com/mis-pedidos` respondió `302` hacia
  `opentextil.cloudflareaccess.com` sin una sesión.
- `/health` y el frontend respondieron correctamente desde el origen AWS.
- La base desplegada contiene las doce tablas normalizadas y cero tablas
  `thesis_*`.
- La aplicación, la política, el DNS y el túnel se comprobaron nuevamente.

La recepción real del código y la navegación autenticada deben comprobarse con
los tres clientes del piloto.

## Reversión

La reversión debe solicitarse expresamente. Para retirar únicamente esta
publicación, detener el conector `tesis-r2-tunnel` y restaurar o retirar la ruta
publicada del túnel `tesis-pedidos-local`. No modificar `peruactiva-pos`,
`pos.opentextil.com` ni sus políticas.
