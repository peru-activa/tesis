import type { GarmentCalibration } from './garmentCalibration';
import { useDesignArtwork } from './DesignLogo';
import { resizeArtworkFrame, visibleArtworkSize } from './artworkBounds';
import type { DesignAttachment } from './designAttachment';

export function DesignSizeFields({
  attachment,
  label,
  name,
  widthCm,
  heightCm,
  onChange,
  calibration,
}: {
  attachment: DesignAttachment;
  calibration?: GarmentCalibration;
  label: string;
  name: string;
  widthCm: number;
  heightCm: number;
  onChange: (size: { widthCm: number; heightCm: number }) => void;
}) {
  const prepared = useDesignArtwork(attachment);
  const isImage = attachment.mediaType.startsWith('image/');
  const geometry = prepared?.result?.geometry;
  const size = isImage
    ? geometry && visibleArtworkSize(geometry, widthCm, heightCm)
    : { width: widthCm, height: heightCm };
  const factor = isImage ? (calibration?.factor ?? 1) : 1;
  const loading = isImage && calibration?.status === 'loading';
  return (
    <>
      {(['width', 'height'] as const).map((axis) => (
        <label key={axis}>
          <span>
            {axis === 'width' ? 'Ancho' : 'Alto'}
            {isImage && calibration?.status === 'estimated' ? ' aprox.' : ''}
          </span>
          <span className="quote-design-size-input">
            <input
              type="number"
              min="0.1"
              max={
                isImage && size
                  ? Math.floor(size[axis] * factor * Math.min(100 / widthCm, 100 / heightCm) * 10) /
                    10
                  : 100
              }
              step="0.1"
              disabled={!size || loading}
              aria-label={`${axis === 'width' ? 'Ancho' : 'Alto'} del ${label} en centímetros`}
              name={`${name}.${axis}Cm`}
              value={size && !loading ? Math.round(size[axis] * factor * 10) / 10 : ''}
              placeholder="…"
              onChange={(event) => {
                const requested = Number(event.target.value);
                if (!requested || !size) return;
                if (!isImage) {
                  onChange({
                    widthCm,
                    heightCm,
                    [`${axis}Cm`]: Math.min(100, Math.max(1, requested)),
                  });
                } else if (geometry) {
                  const next = resizeArtworkFrame(
                    geometry,
                    widthCm,
                    heightCm,
                    axis,
                    requested / factor,
                  );
                  if (next) onChange(next);
                }
              }}
            />
            <small>cm</small>
          </span>
        </label>
      ))}
    </>
  );
}
