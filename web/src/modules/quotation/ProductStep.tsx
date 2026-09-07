import { AddGarmentSelect } from './AddGarmentSelect';
import { GarmentCard } from './GarmentCard';
import type { GarmentPath } from './quotationFormModel';
import { useGarmentCollection } from './useGarmentCollection';

interface ProductStepProps {
  hasGarments: boolean;
  onHasGarmentsChange: (value: boolean) => void;
}

export function ProductStep({ hasGarments, onHasGarmentsChange }: ProductStepProps) {
  const {
    activeIndex,
    addGarment,
    changeQuantity,
    fields,
    garments,
    primaryKey,
    removeGarment,
    setActiveIndex,
  } = useGarmentCollection({ hasGarments, onHasGarmentsChange });

  return (
    <>
      {!hasGarments && (
        <div className="quote-garment-empty">
          <h2>Prendas solicitadas</h2>
          <p>Añade una o más prendas a tu solicitud.</p>
          <svg viewBox="0 0 64 64" role="img" aria-label="Prenda por agregar">
            <path d="M23 11 14 16 8 32l9 4 4-9v26h22V27l4 9 9-4-6-16-9-5c-2 5-16 5-18 0Z" />
            <path d="M23 11c1 6 17 6 18 0M27 17v36M37 17v36" />
          </svg>
        </div>
      )}
      <div className="quote-garment-list">
        {garments.map((garment, index) => {
          const path: GarmentPath = index === 0 ? 'garment' : `additionalGarments.${index - 1}`;
          const garmentKey =
            index === 0 ? primaryKey : (fields[index - 1]?.id ?? `garment-${index}`);

          return (
            <GarmentCard
              key={garmentKey}
              garment={garment}
              garmentKey={garmentKey}
              path={path}
              active={index === activeIndex}
              onActivate={() => setActiveIndex(index)}
              onChangeQuantity={(value) => changeQuantity(path, value)}
              onRemove={() => removeGarment(index)}
            />
          );
        })}
      </div>
      <AddGarmentSelect
        another={garments.length > 0}
        disabled={garments.length >= 5}
        onAdd={addGarment}
      />
    </>
  );
}
