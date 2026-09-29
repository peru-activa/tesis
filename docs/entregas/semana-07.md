# Semana 7: integración R6 con WhatsApp público

La tesis v98 sigue describiendo el canal como `preview_only`. Este incremento
implementa la coordinación técnica para O2/R6 tras la confirmación humana del
plan. La evidencia académica y el IOV quedan pendientes de los tres casos
reales descritos en [`tres-casos-e2e.md`](evidencia-r6/tres-casos-e2e.md).

El portal registra la asignación una sola vez. La API envía al servicio público
de Perú Activa una intención por taller simulado; ese servicio conserva los
recibos de Meta, envía la ficha técnica y los archivos originales disponibles,
y cambia de estado solo ante botones vinculados al mensaje y al remitente. El
modo de prueba dirige todos los envíos al teléfono autorizado de Kevin. Una
aceptación por botón es un compromiso operativo registrado, no una garantía
legal ni una autorización automática para iniciar producción.

**Reproducción local:** `npm ci && npm run verify` en `codigo/`; en el servicio
público, `node pas_PUBLIC_WHATSAPP/server.test.js` y
`node --test pas_PUBLIC_WHATSAPP/meta-ingress.test.js pas_PUBLIC_WHATSAPP/production.test.js`.
Los contratos HTTP se exponen en `/docs`. El despliegue usa las imágenes
inmutables de cada repositorio y la base pública separada en la instancia de la
tesis; no aumenta la cantidad de instancias.

**Estado:** verificación local aprobada. Despliegue y casos con recibos reales
pendientes al redactar esta ficha. No se declara demostrado ni validado R6.
