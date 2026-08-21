# Reglas del repositorio

- Usar Node.js 24, TypeScript estricto y módulos ESM.
- Mantener el dominio independiente de interfaces conversacionales.
- No añadir SDK, modelo, prompt ni dependencia de inteligencia artificial.
- Toda recomendación debe ser determinística para la misma entrada y versión.
- Exponer restricciones, dimensiones, pesos y razones; no devolver decisiones
  opacas.
- La asignación final requiere confirmación humana fuera del motor.
- No copiar datos personales, secretos ni volcados de producción.
- Ejecutar `npm run verify` antes de integrar cambios.

