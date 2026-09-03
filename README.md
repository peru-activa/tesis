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

El portal usa rutas separadas por actor y una entrada automática:

- Entrada por rol: `http://localhost:5173/demo`.
- Cliente — formulario: `http://localhost:5173/nueva-solicitud`.
- Cliente — pedidos actuales y anteriores: `http://localhost:5173/mis-pedidos`.
- Perú Activa: `http://localhost:5173/peru-activa`.
- Taller proveedor: `http://localhost:5173/taller`.
- Evidencia R5: `http://localhost:5173/evidencia-r5`.

En la primera aparecen las solicitudes nuevas y, después de aceptar una
cotización de una sola prenda, la orden evaluada. La bandeja del taller y
WhatsApp usan una notificación canónica; el mensaje de WhatsApp sigue siendo
únicamente una vista previa local.

Cada solicitud de la bandeja de Perú Activa abre su propio detalle en
`/peru-activa/pedidos/COT-XXXXXXXX`. Esa pantalla reutiliza el
resumen mostrado al cliente y permite registrar la cotización manualmente.

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

## Identidad local y Cloudflare Access

El desarrollo reutiliza el patrón de OpenTextil: la aplicación no administra
contraseñas. En producción, la API valida el JWT firmado que Cloudflare Access
entrega en `Cf-Access-Jwt-Assertion`, incluido su emisor y audiencia. El correo
verificado identifica al propietario de cada solicitud; por ello un cliente
solo puede listar y abrir sus propios pedidos. El correo configurado en
`PERU_ACTIVA_EMAIL` obtiene el rol operativo para cotizar y confirmar talleres.

En local, `.env` define `LOCAL_CLIENT_EMAIL` y
`LOCAL_PERU_ACTIVA_EMAIL`. Los cinco talleres simulados ingresan con estos
números reproducibles:

- `900000001`
- `900000002`
- `900000003`
- `900000004`
- `900000005`

El ingreso por número es solamente identificación local para la demostración;
no es autenticación segura. Antes de producción requiere verificación por OTP
de WhatsApp o SMS. Cloudflare Access protege el acceso por correo, no verifica
la posesión de un teléfono.

La demostración externa autorizada está disponible en
`https://pedidos.opentextil.com`. Cloudflare Access usa el proveedor “Código
por correo” y el backend valida `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` y
`PERU_ACTIVA_EMAIL`. El túnel apunta al artefacto compilado local en el puerto
3101; por ello el portal solo permanece disponible mientras el Mac, el backend
y el conector estén encendidos. La operación y reversión se documentan en
[`docs/operations/cloudflare-access-local.md`](docs/operations/cloudflare-access-local.md).

## PostgreSQL

Los comandos `npm run dev` y `npm start` cargan automáticamente el archivo local
ignorado `.env`. En la instalación local auditada contiene `DATABASE_URL` para
PostgreSQL 17 en el puerto 5432. Los pedidos, su historial de estados, las
cotizaciones y las especificaciones técnicas de talleres persisten al reiniciar
el backend.

Como alternativa reproducible con Docker:

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://tesis:tesis_local@localhost:5434/tesis npm run dev
```

Si `DATABASE_URL` no existe, el backend usa memoria únicamente como respaldo
para pruebas aisladas; ese modo no conserva información después de reiniciar.

El esquema reproducible está en [`db/schema.sql`](db/schema.sql). Los datos de
la demostración son simulados y están rotulados como tales en el portal.

La evidencia específica de R4 se reproduce con `npm run evidencia:r4`. El
comando usa un esquema temporal aislado, comprueba que 100 pedidos se recuperen
sin pérdida después de reabrir la conexión y mide la latencia de las consultas
frecuentes frente al límite de 500 ms.

## Verificación

`npm run verify` ejecuta el control de dependencias, tipos del backend y
frontend, pruebas del algoritmo y del flujo integrado, y ambos builds.

Consulta [la arquitectura](docs/architecture.md) y [la integración prevista con
la web pública](docs/production-integration.md). El estado verificable de R1-R13
se mantiene en [`docs/resultados.md`](docs/resultados.md).
