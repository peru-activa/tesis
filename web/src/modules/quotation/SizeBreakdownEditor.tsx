import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch, type FieldArrayPath } from 'react-hook-form';
import {
  resolveGarmentSizeCategory,
  type GarmentSizeCategory,
  type QuotationRequestDraft,
} from '../../../../src/domain/quotation-requests';
import { garmentField, type GarmentPath } from './quotationFormModel';

const sizesByCategory: Record<GarmentSizeCategory, string[]> = {
  adult: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  child: ['4', '6', '8', '10', '12', '14', '16'],
};

const categoryCopy = {
  adult: {
    title: 'Tallas para adultos',
    description: 'Desde XS hasta 3XL',
    addLabel: 'Agregar talla para adultos',
    quantityLabel: 'adulta',
  },
  child: {
    title: 'Tallas para niños',
    description: 'Tallas numéricas del 4 al 16',
    addLabel: 'Agregar talla infantil',
    quantityLabel: 'infantil',
  },
} satisfies Record<
  GarmentSizeCategory,
  { title: string; description: string; addLabel: string; quantityLabel: string }
>;

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
    category?: GarmentSizeCategory;
    quantity: number;
  }>;
  const [childrenOpen, setChildrenOpen] = useState(false);
  const [customSizeOpen, setCustomSizeOpen] = useState(false);
  const [customSize, setCustomSize] = useState('');
  const [customCategory, setCustomCategory] = useState<GarmentSizeCategory>('adult');
  const normalizedSelected = new Set(
    sizes.map((item) =>
      [resolveGarmentSizeCategory(item), item.size.trim().toLocaleUpperCase('es-PE')].join(':'),
    ),
  );
  const total = sizes.reduce(
    (sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0),
    0,
  );
  const difference = quantity - total;
  const showChildren =
    childrenOpen || sizes.some((item) => resolveGarmentSizeCategory(item) === 'child');

  function addSize(size: string, category: GarmentSizeCategory) {
    const normalized = size.trim();
    const selectedKey = [category, normalized.toLocaleUpperCase('es-PE')].join(':');
    if (!normalized || normalizedSelected.has(selectedKey)) return;
    append({ size: normalized, category, quantity: 0 });
    setCustomSize('');
    setCustomSizeOpen(false);
  }

  function openCustomSize(category: GarmentSizeCategory) {
    setCustomCategory(category);
    setCustomSize('');
    setCustomSizeOpen(true);
  }

  function renderCategory(category: GarmentSizeCategory) {
    const copy = categoryCopy[category];
    const categoryFields = fields
      .map((field, index) => ({ field, index, item: sizes[index] }))
      .filter(({ item }) => item && resolveGarmentSizeCategory(item) === category);
    const availableSizes = sizesByCategory[category].filter(
      (size) => !normalizedSelected.has([category, size.toLocaleUpperCase('es-PE')].join(':')),
    );

    return (
      <section className={'quote-size-group ' + category} aria-labelledby={path + '-' + category}>
        <div className="quote-size-group-heading">
          <div>
            <h3 id={path + '-' + category}>{copy.title}</h3>
            <p>{copy.description}</p>
          </div>
          <span>{category === 'adult' ? 'Principal' : 'Opcional'}</span>
        </div>

        {categoryFields.length > 0 && (
          <div className="quote-size-list">
            {categoryFields.map(({ field, index }) => {
              const size = sizes[index]?.size ?? '';
              return (
                <div className="quote-size-row" key={field.id}>
                  <input
                    type="hidden"
                    {...register(garmentField(path, 'sizes.' + index + '.size'))}
                  />
                  <input
                    type="hidden"
                    {...register(garmentField(path, 'sizes.' + index + '.category'))}
                  />
                  <strong>{size}</strong>
                  <label>
                    <span className="quote-visually-hidden">
                      Cantidad para talla {copy.quantityLabel} {size}
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="5000"
                      inputMode="numeric"
                      {...register(garmentField(path, 'sizes.' + index + '.quantity'), {
                        valueAsNumber: true,
                      })}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={'Quitar talla ' + copy.quantityLabel + ' ' + size}
                    title={'Quitar talla ' + size}
                    onClick={() => remove(index)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="quote-size-add">
          <select
            value=""
            aria-label={copy.addLabel}
            onChange={(event) => {
              if (event.target.value === 'custom') {
                openCustomSize(category);
                return;
              }
              addSize(event.target.value, category);
            }}
          >
            <option value="" disabled hidden>
              + {copy.addLabel}
            </option>
            {availableSizes.map((size) => (
              <option value={size} key={size}>
                {size}
              </option>
            ))}
            <option value="custom">Otra talla…</option>
          </select>
        </div>
      </section>
    );
  }

  return (
    <fieldset className="mt-7">
      <legend className="flex w-full items-end justify-between gap-3">
        <span className="quote-field-label">Cantidad por talla</span>
        <span className={total === quantity ? 'quote-total-ok' : 'quote-total-error'}>
          {total} de {quantity}
        </span>
      </legend>

      <div className="quote-size-groups mt-3">
        {renderCategory('adult')}
        {showChildren ? (
          renderCategory('child')
        ) : (
          <button
            className="quote-add-child-sizes"
            type="button"
            aria-label="Agregar tallas para niños"
            onClick={() => setChildrenOpen(true)}
          >
            <span>+</span>
            <strong>Agregar tallas para niños</strong>
            <small>4, 6, 8, 10, 12, 14 y 16</small>
          </button>
        )}
      </div>

      {customSizeOpen && (
        <div className="quote-custom-size mt-3">
          <label>
            <span className="quote-visually-hidden">
              Otra talla {categoryCopy[customCategory].quantityLabel}
            </span>
            <input
              autoFocus
              value={customSize}
              onChange={(event) => setCustomSize(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addSize(customSize, customCategory);
                }
              }}
              placeholder={customCategory === 'child' ? 'Ejemplo: 18' : 'Ejemplo: 4XL'}
            />
          </label>
          <button
            type="button"
            disabled={!customSize.trim()}
            onClick={() => addSize(customSize, customCategory)}
          >
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
          {difference > 0 ? 'faltan ' + difference : 'sobran ' + Math.abs(difference)} unidades.
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
