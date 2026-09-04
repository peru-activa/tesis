# Evidencia de copia y restauración de R4

Fecha de ejecución: 2026-09-04T05:47:15.897Z

Los datos son simulados. La prueba generó una copia de PostgreSQL en un repositorio S3 independiente del volumen del servidor, verificó su checksum, la restauró en una base temporal y comparó los conteos con la base de origen.

## Copia

- Bucket: tesis-r4-backups-479494991128-us-east-1.
- Objeto: r4/20260904T054702Z.dump.
- Tamaño: 81081 bytes.
- Cifrado del servidor: AES256.
- Versión S3: XPFMdiT.XValsQIP25tKSoa5zHxQvQRt.

## Restauración

- Checksum verificado: **SÍ**.
- Conteos de origen: {"orders":300,"history":300,"workshops":7,"order_sizes":1200,"workshop_capabilities":188,"allocations":0}.
- Conteos restaurados: {"orders":300,"history":300,"workshops":7,"order_sizes":1200,"workshop_capabilities":188,"allocations":0}.
- Coincidencia exacta: **SÍ**.
- Base temporal eliminada después de la verificación: **SÍ**.

## Resultado

La copia automatizada y su restauración reproducible: **CUMPLEN**.
