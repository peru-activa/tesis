import type { DesignAttachment } from './designAttachment';
import type { Garment } from './quotationFormModel';
import type { GarmentCalibration } from './garmentCalibration';

export const garmentViews = {
  front: {
    label: 'Frente',
    at: 'en el frente',
    to: 'al frente',
    caption: 'Tu prenda seleccionada',
    kind: 'body',
  },
  back: {
    label: 'Espalda',
    at: 'en la espalda',
    to: 'a la espalda',
    caption: 'Vista posterior referencial',
    kind: 'body',
  },
  'sleeve-left': {
    label: 'Manga izquierda',
    at: 'en la manga izquierda',
    to: 'a la manga izquierda',
    caption: 'Costado de la manga izquierda · Vista referencial',
    kind: 'sleeve',
  },
  'sleeve-right': {
    label: 'Manga derecha',
    at: 'en la manga derecha',
    to: 'a la manga derecha',
    caption: 'Costado de la manga derecha · Vista referencial',
    kind: 'sleeve',
  },
} as const;
export type View = keyof typeof garmentViews;
export const allGarmentViews = Object.keys(garmentViews) as View[];

export function availableGarmentViews(hasSleeves: boolean): View[] {
  return allGarmentViews.filter((view) => hasSleeves || garmentViews[view].kind === 'body');
}

export function calibrationForView(
  calibration: GarmentCalibration,
  view: View,
): GarmentCalibration {
  return garmentViews[view].kind === 'body' ? calibration : { status: 'uncalibrated' };
}

export interface LogoTransform {
  view: View;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface PreviewApplication {
  attachment?: DesignAttachment;
  placement: string;
  method?: 'printing' | 'embroidery' | 'sublimation' | 'vinyl';
  widthCm?: number;
  heightCm?: number;
}

export function garmentDesignApplications(
  garment: Pick<
    Garment,
    'designApplications' | 'designAttachment' | 'customizationDetails' | 'customization'
  >,
): PreviewApplication[] {
  const fallbackMethod = garment.customization === 'none' ? undefined : garment.customization;
  if (garment.designApplications?.length)
    return garment.designApplications.map((application) => ({
      ...application,
      method: application.method ?? fallbackMethod,
    }));
  return garment.designAttachment
    ? [
        {
          attachment: garment.designAttachment,
          placement: garment.customizationDetails,
          method: fallbackMethod,
        },
      ]
    : [];
}

const DEFAULT_TRANSFORM: LogoTransform = {
  view: 'front',
  x: 52,
  y: 40,
  width: 16,
  height: 10,
};
const TRANSFORM_PATTERN =
  /^(.+?) · posición (\d+(?:\.\d+)?)%, (\d+(?:\.\d+)?)% · tamaño (\d+(?:\.\d+)?)%(?: · giro (0|90|180|270)°)?$/;

export function designPlacementLabel(value: string): string {
  return value.match(TRANSFORM_PATTERN)?.[1] ?? value;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function constrainTransform(transform: LogoTransform): LogoTransform {
  const quarterTurn = (transform.rotation ?? 0) % 180 !== 0;
  const halfWidth = Math.min(50, (quarterTurn ? transform.height : transform.width) / 2);
  const halfHeight = Math.min(50, (quarterTurn ? transform.width : transform.height) / 2);
  return {
    ...transform,
    x: clamp(transform.x, halfWidth, 100 - halfWidth),
    y: clamp(transform.y, halfHeight, 100 - halfHeight),
  };
}

export function parseTransform(value: string): LogoTransform {
  const match = value.match(TRANSFORM_PATTERN);
  const view = allGarmentViews.find((view) => garmentViews[view].label === (match?.[1] ?? value));
  if (match && view) {
    return {
      view,
      x: clamp(Number(match[2]), 5, 95),
      y: clamp(Number(match[3]), 5, 95),
      width: clamp(Number(match[4]), 8, 45),
      height: clamp(Number(match[4]), 5, 45),
      ...(match[5] ? { rotation: Number(match[5]) } : {}),
    };
  }
  if (view) return { ...DEFAULT_TRANSFORM, view, x: 50, y: 42 };
  return { ...DEFAULT_TRANSFORM };
}

export function serializeTransform(transform: LogoTransform): string {
  const view = garmentViews[transform.view].label;
  const rotation = transform.rotation ? ` · giro ${transform.rotation}°` : '';
  return `${view} · posición ${Math.round(transform.x)}%, ${Math.round(transform.y)}% · tamaño ${Math.round(transform.width)}%${rotation}`;
}

export function designLogoStyle(
  application: PreviewApplication,
  transform = parseTransform(application.placement),
) {
  return {
    left: `${transform.x}%`,
    top: `${transform.y}%`,
    width: `${application.widthCm ? application.widthCm * 2 : transform.width}%`,
    height: `${application.heightCm ? application.heightCm * 2 : transform.height}%`,
    ...(transform.rotation
      ? { transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)` }
      : {}),
  };
}

export function designApplicationLabel(
  attachment: DesignAttachment | undefined,
  index: number,
): string {
  return `${attachment?.text ? 'Texto' : 'Logo'} ${index + 1}`;
}
