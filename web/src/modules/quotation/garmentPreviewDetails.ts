import { findFabricOption, findPoloPreview, poloCuts, poloSleeves } from './quotationCatalog';
import type { Garment } from './quotationFormModel';

export function garmentPreviewDetails(garment: Garment) {
  const cut = poloCuts.find((option) => option.value === garment.cut)?.label;
  const sleeve = poloSleeves.find((option) => option.value === garment.sleeve)?.label;
  const polo = findPoloPreview(garment);
  const fabric = findFabricOption(
    garment.product,
    garment.fabric.mode === 'specified' ? garment.fabric.name : undefined,
  );
  return {
    title:
      garment.product === 'polo'
        ? [garment.model, cut, sleeve].filter(Boolean).join(' · ')
        : garment.model,
    garmentImage: garment.product === 'polo' ? polo?.image : fabric?.image,
    garmentAlt: garment.product === 'polo' ? polo?.alt : fabric?.alt,
    garmentBackImage: garment.product === 'polo' ? polo?.backImage : undefined,
    garmentBackAlt: garment.product === 'polo' ? polo?.backAlt : undefined,
    fabricTitle:
      garment.fabric.mode === 'proposal'
        ? 'Tela por recomendar'
        : (fabric?.title ?? garment.fabric.name),
  };
}
