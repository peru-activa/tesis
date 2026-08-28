# Identidad y acceso del portal — Semana 3

## Trazabilidad

| Elemento              | Alcance                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Objetivos/resultados  | Soporte técnico para R1 y R7 parciales                                                           |
| Actor principal       | Cliente de Perú Activa                                                                           |
| Actores internos      | Perú Activa y cinco talleres simulados                                                           |
| Medio de verificación | Flujo web, contratos HTTP y pruebas de autorización                                              |
| IOV                   | No se atribuye cumplimiento de un IOV; la identidad no sustituye la validación con participantes |
| Estado                | Prototipo local reproducible y publicación temporal protegida por Cloudflare Access               |

## Casos de uso

### UC-AUTH-01 — Cliente consulta sus pedidos

1. El cliente abre el enlace del formulario.
2. En producción, Cloudflare Access verifica su correo mediante OTP o Google.
3. El backend valida el JWT de Access y registra la solicitud con ese propietario.
4. El cliente abre `Mis pedidos` y ve únicamente solicitudes de su identidad.
5. Puede abrir una solicitud, consultar su estado y aceptar o rechazar una
   cotización propia.

### UC-AUTH-02 — Perú Activa atiende solicitudes

1. Access verifica el correo autorizado de Perú Activa.
2. El backend reconoce el rol `peru_activa`.
3. La bandeja muestra todas las solicitudes y permite cotizarlas y confirmar
   talleres.

### UC-AUTH-03 — Taller consulta trabajos asignados

1. En la demostración local, el taller ingresa uno de los teléfonos simulados
   de nueve dígitos.
2. El backend lo asocia con un taller del dataset.
3. La bandeja muestra únicamente órdenes confirmadas para ese taller.

El ingreso por teléfono no es autenticación de producción. Antes de usar datos
reales deberá reemplazarse por un código de un solo uso enviado por WhatsApp o
SMS. Cloudflare Access no verifica teléfonos.

## Reglas de autorización

- El navegador nunca decide qué registros puede leer: el backend filtra por la
  identidad verificada.
- El correo enviado dentro del formulario es un dato de contacto y no concede
  propiedad ni permisos.
- Solo `peru_activa` lista todas las solicitudes, cotiza y confirma talleres.
- Un cliente solo lista, consulta y responde sus propias solicitudes.
- Un taller solo recibe notificaciones cuyo `workshopId` coincide con su
  identidad simulada.
- Los encabezados de identidad local se ignoran cuando la petición contiene la
  identidad de Cloudflare Access o el servidor funciona en modo producción.
- Los eventos WebSocket no transportan pedidos: únicamente invalidan la caché;
  cada vista vuelve a consultar la API autorizada.

## Contrato de identidad

El backend reutiliza el patrón auditado de OpenTextil:

- recibe `Cf-Access-Jwt-Assertion`;
- descarga y conserva temporalmente el JWKS de la organización;
- valida firma RS256, emisor y audiencia con `jose`;
- obtiene `sub` y `email` del token ya verificado;
- asigna el rol interno según configuración del servidor.

Variables requeridas al activar Access:

- `CF_ACCESS_TEAM_DOMAIN`;
- `CF_ACCESS_AUD`;
- `PERU_ACTIVA_EMAIL`.

En desarrollo, sin `CF_ACCESS_AUD`, el backend usa identidades simuladas
configuradas localmente. Esta excepción falla cerrada en producción.

## Datos simulados

La tesis identifica cinco talleres como cantidad prevista del piloto. Por ello
se conservan cinco talleres totales, no cinco por proceso. Sus nombres,
teléfonos, capacidades, disponibilidad y métricas son simulados y versionados.
La cobertura conjunta incluye abastecimiento de tela, diseño/patronaje, corte,
sublimación, estampado, vinil, bordado, confección, colocación de avíos,
planchado, acabados, control de calidad y entrega.

## Activación autorizada del 27/08/2026

Se publicó temporalmente `pedidos.opentextil.com` mediante un túnel separado
que apunta al artefacto compilado local. La aplicación Access utiliza solamente
el proveedor `Código por correo`. El túnel `peruactiva-pos` y
`pos.opentextil.com` no fueron modificados. La configuración operativa y el
procedimiento de reversión se encuentran en
`docs/operations/cloudflare-access-local.md`.

## Limitaciones

- La publicación depende de procesos locales y no sustituye el despliegue AWS
  comprometido por la tesis.
- No se afirma seguridad operativa para el acceso telefónico de talleres.
- La autenticación es infraestructura de soporte; no demuestra por sí misma
  R1, R5, R7, R8 ni sus IOV.
- Cloudflare deberá documentarse como componente complementario sin sustituir
  el despliegue AWS comprometido por la tesis.
