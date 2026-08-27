import type { FabricOption } from './quotationCatalog';

interface GarmentPreviewProps {
  garmentImage: string;
  garmentAlt: string;
  title: string;
  fabric?: FabricOption;
  fabricTitle?: string;
  fabricMode: boolean;
}

export function GarmentPreview({
  garmentImage,
  garmentAlt,
  title,
  fabric,
  fabricTitle,
  fabricMode,
}: GarmentPreviewProps) {
  return (
    <figure className={`quote-garment-preview ${fabricMode ? 'fabric-mode' : ''}`}>
      <div className="quote-preview-media">
        <img className="quote-preview-garment" src={garmentImage} alt={garmentAlt} />
        {fabricMode && fabric && (
          <img className="quote-preview-fabric-large" src={fabric.image} alt={fabric.alt} />
        )}
      </div>
      <figcaption>
        <div className="quote-preview-heading">
          <strong>{title}</strong>
          <span>{fabricTitle ? `${fabricTitle} · Imagen referencial` : 'Imagen referencial'}</span>
        </div>
        {fabricMode && fabric ? (
          <div className="quote-preview-fabric-details">
            <div>
              <small>Beneficio</small>
              <p>{fabric.benefit}</p>
            </div>
            <div>
              <small>Especificación técnica</small>
              <p>{fabric.specification}</p>
            </div>
          </div>
        ) : (
          fabric && <img className="quote-preview-fabric" src={fabric.image} alt={fabric.alt} />
        )}
      </figcaption>
    </figure>
  );
}
