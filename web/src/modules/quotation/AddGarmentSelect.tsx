import type { Product } from './quotationCatalog';

const availableProducts = [{ value: 'polo', label: 'Polo' }] as const satisfies ReadonlyArray<{
  value: Product;
  label: string;
}>;

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
        {availableProducts.map((product) => (
          <option value={product.value} key={product.value}>
            {product.label}
          </option>
        ))}
      </select>
    </div>
  );
}
