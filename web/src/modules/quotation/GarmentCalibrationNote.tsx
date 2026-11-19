import type { GarmentCalibration } from './garmentCalibration';
export function GarmentCalibrationNote({ calibration }: { calibration: GarmentCalibration }) {
  return (
    <small className="quote-configured-preview-note" data-calibration={calibration.status}>
      {calibration.status === 'estimated'
        ? `Medidas estimadas · Referencia ${calibration.reference.size}, largo ${calibration.reference.lengthCm} cm · Por confirmar en prenda real`
        : calibration.status === 'loading'
          ? 'Calculando la escala de la prenda…'
          : 'Escala de esta prenda por confirmar · Medidas referenciales'}
    </small>
  );
}
