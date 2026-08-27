import type { Product } from './quotationCatalog';

interface AddGarmentSelectProps {
  disabled: boolean;
  another?: boolean;
  onAdd: (product: Product) => void;
}

export function AddGarmentSelect({ disabled, another = false, onAdd }: AddGarmentSelectProps) {
  return (
    <div className="quote-add-native">
      <select
        value=""
        aria-label={another ? 'Agregar otra prenda' : 'Agregar prenda'}
        disabled={disabled}
        onChange={(event) => {
          if (!event.target.value) return;
          onAdd(event.target.value as Product);
        }}
      >
        <option value="" disabled hidden>
          {another ? '+ Agregar otra prenda' : '+ Agregar prenda'}
        </option>
        <option value="polo">Polo</option>
        <option value="buzo">Buzo</option>
      </select>
    </div>
  );
}
