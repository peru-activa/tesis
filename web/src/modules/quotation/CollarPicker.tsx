import type { PoloCollarOption } from './quotationCatalog';

interface CollarPickerProps {
  inputName: string;
  options: readonly PoloCollarOption[];
  selected?: PoloCollarOption;
  expanded: boolean;
  onEdit: () => void;
  onPreview: (option: PoloCollarOption) => void;
  onSelect: (option: PoloCollarOption) => void;
}

export function CollarPicker({
  inputName,
  options,
  selected,
  expanded,
  onEdit,
  onPreview,
  onSelect,
}: CollarPickerProps) {
  return (
    <fieldset>
      <legend className="quote-field-label">Tipo de cuello</legend>
      {!expanded && selected ? (
        <div className="quote-selected-fabric quote-selected-collar">
          <img src={selected.image} alt="" />
          <div>
            <strong>{selected.value}</strong>
            <small>Cuello</small>
          </div>
          <button type="button" onClick={onEdit}>
            Cambiar
          </button>
        </div>
      ) : (
        <div className="quote-image-option-grid collars">
          {options.map((option) => (
            <label
              className={selected?.value === option.value ? 'selected' : ''}
              key={option.value}
              onFocus={() => onPreview(option)}
              onMouseEnter={() => onPreview(option)}
            >
              <input
                className="quote-visually-hidden"
                type="radio"
                name={inputName}
                value={option.value}
                checked={selected?.value === option.value}
                onChange={() => onSelect(option)}
              />
              <img src={option.image} alt="" />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
