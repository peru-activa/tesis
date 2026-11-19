import type { HTMLAttributes } from 'react';
import { RecolorableGarmentImage } from './RecolorableGarmentImage';
import { resolveGarmentColor } from './garmentColor';
import { garmentViews, type View } from './designPreviewModel';

export function GarmentDesignCanvas({
  view,
  color: selectedColor,
  garmentImage,
  garmentAlt,
  garmentBackImage,
  garmentBackAlt,
  sleeve,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  view: View;
  color: string;
  garmentImage?: string;
  garmentAlt?: string;
  garmentBackImage?: string;
  garmentBackAlt?: string;
  sleeve?: string;
}) {
  const color = resolveGarmentColor(selectedColor);
  const surface = garmentViews[view];
  const source =
    surface.kind === 'sleeve' ? undefined : view === 'front' ? garmentImage : garmentBackImage;
  const alt = view === 'front' ? garmentAlt : garmentBackAlt;
  return (
    <div className="quote-design-shirt" {...props}>
      {surface.kind === 'sleeve' ? (
        <svg
          viewBox="0 0 320 320"
          role="img"
          aria-label={`${surface.label}: costado exterior referencial`}
        >
          <path
            className="quote-design-shirt-body"
            style={{ fill: color || '#17243A' }}
            d={
              sleeve === 'manga_larga'
                ? 'M78 294 60 91Q62 24 160 18Q258 24 260 91L242 294Z'
                : 'M70 257 57 104Q62 47 160 39Q258 47 263 104L250 257Z'
            }
          />
          <path
            className="quote-design-shirt-seam"
            d={
              sleeve === 'manga_larga'
                ? 'M80 280H240M65 91Q160 6 255 91'
                : 'M72 243H248M62 104Q160 22 258 104'
            }
          />
        </svg>
      ) : source ? (
        <RecolorableGarmentImage
          className="quote-design-product-photo"
          src={source}
          color={color}
          alt={alt ?? `${surface.label} de la prenda seleccionada`}
        />
      ) : (
        <svg
          viewBox="0 0 320 340"
          role="img"
          aria-label={`${surface.label} referencial de la prenda`}
        >
          <path
            className="quote-design-shirt-shadow"
            d="M92 31 39 55 8 124l44 22 22-38v205h172V108l22 38 44-22-31-69-53-24-25-18c-13 16-73 16-86 0L92 31Z"
          />
          <path
            className="quote-design-shirt-body"
            style={{ fill: color || '#17243A' }}
            d="M92 25 39 49 8 118l44 22 22-38v205h172V102l22 38 44-22-31-69-53-24-25-18c-13 16-73 16-86 0L92 25Z"
          />
          <path className="quote-design-shirt-seam" d="M117 8c12 21 74 21 86 0" />
        </svg>
      )}
      {children}
    </div>
  );
}
