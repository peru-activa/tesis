import { describe, expect, it } from 'vitest';
import {
  allGarmentViews,
  garmentViews,
  parseTransform,
  serializeTransform,
  designLogoStyle,
  calibrationForView,
  constrainTransform,
} from './designPreviewModel';

describe('superficies y orientación del diseño', () => {
  it('recupera las cuatro superficies y los giros, conservando el contrato anterior', () => {
    for (const view of allGarmentViews) {
      for (const rotation of [0, 90, 180, 270]) {
        const original = { view, x: 50, y: 40, width: 16, height: 10, rotation };
        const placement = serializeTransform(original);
        expect(parseTransform(placement)).toMatchObject({ view, x: 50, y: 40, width: 16 });
        expect(parseTransform(placement).rotation ?? 0).toBe(rotation);
        expect(parseTransform(garmentViews[view].label).view).toBe(view);
        expect(designLogoStyle({ placement }, original).transform).toBe(
          rotation ? `translate(-50%, -50%) rotate(${rotation}deg)` : undefined,
        );
      }
    }
    expect(serializeTransform({ view: 'front', x: 52, y: 40, width: 16, height: 10 })).toBe(
      'Frente · posición 52%, 40% · tamaño 16%',
    );
    expect(parseTransform('Ubicación por confirmar').view).toBe('front');
  });

  it('usa los ejes girados al limitar el lienzo y no aplica la escala del cuerpo a una manga', () => {
    expect(
      constrainTransform({
        view: 'sleeve-left',
        x: 0,
        y: 100,
        width: 40,
        height: 10,
        rotation: 90,
      }),
    ).toMatchObject({ x: 5, y: 80 });
    const calibration = {
      status: 'estimated',
      factor: 1.5,
      reference: { size: 'M', lengthCm: 72, status: 'estimated' },
    } as const;
    expect(calibrationForView(calibration, 'front')).toBe(calibration);
    expect(calibrationForView(calibration, 'back')).toBe(calibration);
    expect(calibrationForView(calibration, 'sleeve-left')).toEqual({ status: 'uncalibrated' });
    expect(calibrationForView(calibration, 'sleeve-right')).toEqual({ status: 'uncalibrated' });
  });
});
