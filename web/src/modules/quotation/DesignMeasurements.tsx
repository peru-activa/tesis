import type { GarmentCalibration } from './garmentCalibration';
import { useDesignArtwork } from './DesignLogo';
import { visibleArtworkSize } from './artworkBounds';
import type { DesignAttachment } from './designAttachment';

const measurement = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function DesignMeasurements({
  attachment,
  widthCm,
  heightCm,
  calibration,
}: {
  attachment: DesignAttachment;
  widthCm?: number;
  heightCm?: number;
  calibration?: GarmentCalibration;
}) {
  const prepared = useDesignArtwork(attachment);
  if (!widthCm || !heightCm) return <span>Medidas del logo por definir</span>;
  const isImage = attachment.mediaType.startsWith('image/');
  const size = isImage
    ? prepared?.result?.geometry && visibleArtworkSize(prepared.result.geometry, widthCm, heightCm)
    : { width: widthCm, height: heightCm };
  if (isImage && calibration?.status === 'loading')
    return <span>Calculando medidas estimadas…</span>;
  const factor = isImage ? (calibration?.factor ?? 1) : 1;
  if (!size)
    return (
      <span>
        {prepared?.error || prepared?.result
          ? 'Medidas visibles por verificar'
          : 'Calculando medidas visibles…'}
      </span>
    );
  return (
    <span>
      {isImage
        ? calibration?.status === 'estimated'
          ? 'Estimado · '
          : calibration
            ? 'Referencia sin calibrar · '
            : ''
        : 'Archivo PDF · '}
      Ancho {measurement.format(size.width * factor)} cm · Alto{' '}
      {measurement.format(size.height * factor)} cm
    </span>
  );
}
