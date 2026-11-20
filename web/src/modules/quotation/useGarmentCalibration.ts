import { useEffect, useState } from 'react';
import { prepareGarment } from './RecolorableGarmentImage';
import { garmentPreviewDetails } from './garmentPreviewDetails';
import {
  calibrateGarmentPair,
  garmentReference,
  normalizedGarmentLength,
  type GarmentCalibration,
} from './garmentCalibration';
import type { Garment } from './quotationFormModel';

const unavailable: GarmentCalibration = { status: 'uncalibrated' };
export function useGarmentCalibration(garment: Garment): GarmentCalibration {
  const { garmentImage: front, garmentBackImage: back } = garmentPreviewDetails(garment);
  const reference = garmentReference(garment.product, garment.cut);
  const key = JSON.stringify([front, back, reference]);
  const [result, setResult] = useState<{ key: string; calibration: GarmentCalibration }>();
  useEffect(() => {
    if (!reference || !front || !back) return;
    let active = true;
    void Promise.all([prepareGarment(front), prepareGarment(back)]).then(
      (images) => {
        const calibration = calibrateGarmentPair(
          reference,
          images.map((image) => normalizedGarmentLength(image) ?? NaN),
        );
        if (active) setResult({ key, calibration });
      },
      () => {
        if (active) setResult({ key, calibration: unavailable });
      },
    );
    return () => {
      active = false;
    };
  }, [front, back, reference, key]);
  if (!reference || !front || !back) return unavailable;
  return result?.key === key ? result.calibration : { status: 'loading', reference };
}
