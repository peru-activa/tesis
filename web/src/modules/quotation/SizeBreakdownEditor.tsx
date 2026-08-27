import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch, type FieldArrayPath } from 'react-hook-form';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { garmentField, type GarmentPath } from './quotationFormModel';

const standardSizes = [
  '4',
  '6',
  '8',
  '10',
  '12',
  '14',
  '16',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
];

interface SizeBreakdownEditorProps {
  path: GarmentPath;
  quantity: number;
}

export function SizeBreakdownEditor({ path, quantity }: SizeBreakdownEditorProps) {
  const { control, register } = useFormContext<QuotationRequestDraft>();
  const sizesPath = garmentField(path, 'sizes') as FieldArrayPath<QuotationRequestDraft>;
  const { fields, append, remove } = useFieldArray({ control, name: sizesPath });
  const sizes = useWatch({ control, name: sizesPath }) as Array<{
    size: string;
    quantity: number;
  }>;
  const [customSizeOpen, setCustomSizeOpen] = useState(false);
  const [customSize, setCustomSize] = useState('');
  const normalizedSelected = new Set(
    sizes.map((item) => item.size.trim().toLocaleUpperCase('es-PE')),
  );
  const availableSizes = standardSizes.filter(
    (size) => !normalizedSelected.has(size.toLocaleUpperCase('es-PE')),
  );
  const total = sizes.reduce(
    (sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0),
    0,
  );
  const difference = quantity - total;

  function addSize(size: string) {
    const normalized = size.trim();
    if (!normalized || normalizedSelected.has(normalized.toLocaleUpperCase('es-PE'))) return;
    append({ size: normalized, quantity: 0 });
    setCustomSize('');
    setCustomSizeOpen(false);
  }

  return (
    <fieldset className="mt-7">
      <legend className="flex w-full items-end justify-between gap-3">
        <span className="quote-field-label">Cantidad por talla</span>
        <span className={total === quantity ? 'quote-total-ok' : 'quote-total-error'}>
          {total} de {quantity}
        </span>
      </legend>

      {fields.length > 0 && (
        <div className="quote-size-list mt-3">
          {fields.map((field, index) => {
            const size = sizes[index]?.size ?? '';
            return (
              <div className="quote-size-row" key={field.id}>
                <input type="hidden" {...register(garmentField(path, `sizes.${index}.size`))} />
                <strong>{size}</strong>
                <label>
                  <span className="quote-visually-hidden">Cantidad para talla {size}</span>
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    inputMode="numeric"
                    {...register(garmentField(path, `sizes.${index}.quantity`), {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Quitar talla ${size}`}
                  title={`Quitar talla ${size}`}
                  onClick={() => remove(index)}
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="quote-size-add mt-3">
        <select
          value=""
          aria-label="Agregar talla"
          onChange={(event) => {
            if (event.target.value === 'custom') {
              setCustomSizeOpen(true);
              return;
            }
            addSize(event.target.value);
          }}
        >
          <option value="" disabled hidden>
            + Agregar talla
          </option>
          {availableSizes.map((size) => (
            <option value={size} key={size}>
              {size}
            </option>
          ))}
          <option value="custom">Otra talla…</option>
        </select>
      </div>

      {customSizeOpen && (
        <div className="quote-custom-size mt-3">
          <label>
            <span className="quote-visually-hidden">Otra talla</span>
            <input
              autoFocus
              value={customSize}
              onChange={(event) => setCustomSize(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addSize(customSize);
                }
              }}
              placeholder="Ejemplo: 18 o 4XL"
            />
          </label>
          <button type="button" disabled={!customSize.trim()} onClick={() => addSize(customSize)}>
            Agregar
          </button>
          <button type="button" onClick={() => setCustomSizeOpen(false)}>
            Cancelar
          </button>
        </div>
      )}

      {total !== quantity && (
        <p className="mt-3 text-sm font-semibold text-red-700">
          La distribución debe sumar {quantity};{' '}
          {difference > 0 ? `faltan ${difference}` : `sobran ${Math.abs(difference)}`} unidades.
        </p>
      )}
    </fieldset>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="m6.5 7 .8 13h9.4l.8-13" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}
