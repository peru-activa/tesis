# Publicación local con Cloudflare Access

Estado verificado: 27 de agosto de 2026, zona horaria `America/Lima`.

## Alcance

Esta publicación permite demostrar el acceso por correo y el aislamiento de
pedidos sin desplegar todavía el sistema en AWS. No modifica el POS ni su
túnel productivo.

| Recurso | Valor |
| --- | --- |
| Hostname | `pedidos.opentextil.com` |
| Aplicación Access | `Peru Activa Pedidos - Tesis` |
| ID de aplicación | `2e32be23-e4d8-40d1-968f-58fc8c38759e` |
| Política | `Clientes con código por correo` |
| ID de política | `c01cad13-7460-40a9-8940-5c97ce138348` |
| Túnel | `tesis-pedidos-local` |
| ID de túnel | `598d5ddf-432c-4e3c-8134-922272b5b96d` |
| DNS | CNAME proxied hacia el túnel |
| ID de registro DNS | `ed052d9348c4033e498b82f8f0214366` |
| Origen local | `http://127.0.0.1:3101` |

## Autorización

- Access exige autenticación mediante el proveedor `Código por correo`.
- La política acepta correos válidos porque el portal está dirigido a clientes
  externos. Esto es deliberado y no se debe reutilizar para una aplicación
  interna.
- La API valida firma, emisor y audiencia del JWT antes de confiar en el correo.
- PostgreSQL filtra cada solicitud por su propietario verificado.
- `peruactiva13@gmail.com` obtiene el rol `peru_activa`; los demás correos
  obtienen el rol `client`.
- Los talleres por teléfono permanecen como demostración local y no se publican
  como autenticación de producción.

## Operación

El backend externo se inicia desde `codigo/` con:

```bash
npm run build
NODE_ENV=production PORT=3101 npm start
```

El conector `cloudflared` usa el token del túnel obtenido directamente desde
Cloudflare. El token no se guarda en el repositorio ni se documenta. Si el Mac,
el backend o el conector se detienen, el hostname deja de alcanzar el origen.

## Verificación ejecutada

- El túnel registró conexiones QUIC en Cloudflare.
- `https://pedidos.opentextil.com/demo` respondió `302` hacia
  `opentextil.cloudflareaccess.com` sin una sesión.
- `http://127.0.0.1:3101/health` respondió `200` desde el origen.
- La aplicación, política, DNS y túnel se consultaron nuevamente por API.

La recepción real del código y la navegación autenticada deben comprobarse
manualmente con los dos correos autorizados para la demostración.

## Reversión

La reversión debe solicitarse expresamente. Para retirar únicamente esta
publicación, detener primero el conector y el backend del puerto 3101; después
eliminar, usando los IDs exactos de esta ficha, la aplicación Access, el
registro DNS y el túnel `tesis-pedidos-local`. No modificar
`peruactiva-pos`, `pos.opentextil.com` ni sus políticas.
