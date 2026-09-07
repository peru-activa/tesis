# Evidencia de copia y restauración de R4

Fecha de ejecución: 2026-09-04T15:17:55.452Z

Los datos son simulados. La prueba generó una copia de PostgreSQL en un repositorio S3 independiente del volumen del servidor, verificó su checksum, la restauró en una base temporal y comparó los conteos con la base de origen.

## Copia

- Bucket: tesis-r4-backups-479494991128-us-east-1.
- Objeto: r4/20260904T151742Z.dump.
- Tamaño: 92663 bytes.
- Cifrado del servidor: AES256.
- Versión S3: y_s53.5GVx83hsYLfdm4e5oMyBE4VgZu.

## Restauración

- Checksum verificado: **SÍ**.
- Conteos de origen: {"orders":400,"history":400,"workshops":7,"order_sizes":1600,"workshop_capabilities":188,"allocations":0}.
- Conteos restaurados: {"orders":400,"history":400,"workshops":7,"order_sizes":1600,"workshop_capabilities":188,"allocations":0}.
- Coincidencia exacta: **SÍ**.
- Base temporal eliminada después de la verificación: **SÍ**.

## Resultado

La copia automatizada y su restauración reproducible: **CUMPLEN**.
