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
