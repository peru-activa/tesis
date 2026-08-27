import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import type { Product } from './quotationCatalog';
import { createEmptyGarment, garmentField, type GarmentPath } from './quotationFormModel';

interface UseGarmentCollectionOptions {
  hasGarments: boolean;
  onHasGarmentsChange: (value: boolean) => void;
}

export function useGarmentCollection({
  hasGarments,
  onHasGarmentsChange,
}: UseGarmentCollectionOptions) {
  const { setValue, getValues, control } = useFormContext<QuotationRequestDraft>();
  const { fields, append, remove } = useFieldArray({ control, name: 'additionalGarments' });
  const primary = useWatch({ control, name: 'garment' });
  const additional = useWatch({ control, name: 'additionalGarments' });
  const garments = hasGarments ? [primary, ...additional] : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [primaryVersion, setPrimaryVersion] = useState(0);
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, garments.length - 1));

  function changeQuantity(path: GarmentPath, value: number) {
    setValue(garmentField(path, 'quantity'), value, {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (Number.isInteger(value) && value > 0) {
      setValue(garmentField(path, 'sizes'), [], { shouldDirty: true });
    }
  }

  function addGarment(product: Product) {
    if (!hasGarments) {
      setValue('garment', createEmptyGarment(product), { shouldDirty: true });
      onHasGarmentsChange(true);
      setActiveIndex(0);
      setPrimaryVersion((version) => version + 1);
      return;
    }

    append(createEmptyGarment(product));
    setActiveIndex(garments.length);
  }

  function removeGarment(index: number) {
    if (garments.length === 1) {
      setValue('garment', createEmptyGarment('polo'), { shouldDirty: true });
      setValue('additionalGarments', [], { shouldDirty: true });
      onHasGarmentsChange(false);
      setActiveIndex(0);
      setPrimaryVersion((version) => version + 1);
      return;
    }

    if (index === 0) {
      const nextGarment = getValues('additionalGarments.0');
      if (nextGarment) {
        setValue('garment', nextGarment, { shouldDirty: true, shouldValidate: true });
        remove(0);
      }
      setActiveIndex(0);
      setPrimaryVersion((version) => version + 1);
      return;
    }

    remove(index - 1);
    setActiveIndex(Math.min(index, garments.length - 2));
  }

  return {
    activeIndex: safeActiveIndex,
    addGarment,
    changeQuantity,
    fields,
    garments,
    primaryKey: `primary-garment-${primaryVersion}`,
    removeGarment,
    setActiveIndex,
  };
}
