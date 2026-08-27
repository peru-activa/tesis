import type { TextOption } from './quotationCatalog';

interface TextOptionPickerProps<T extends string> {
  inputName: string;
  legend: string;
  summaryLabel: string;
  options: readonly TextOption<T>[];
  selected?: TextOption<T>;
  expanded: boolean;
  onEdit: () => void;
  onSelect: (option: TextOption<T>) => void;
}

export function TextOptionPicker<T extends string>({
  inputName,
  legend,
  summaryLabel,
  options,
  selected,
  expanded,
  onEdit,
  onSelect,
}: TextOptionPickerProps<T>) {
  return (
    <fieldset>
      <legend className="quote-field-label">{legend}</legend>
      {!expanded && selected ? (
        <div className="quote-selected-text-option">
          <span>
            <strong>{selected.label}</strong>
            <small>{summaryLabel}</small>
          </span>
          <button type="button" onClick={onEdit}>
            Cambiar
          </button>
        </div>
      ) : (
        <div className="quote-text-option-grid">
          {options.map((option) => (
            <label
              className={selected?.value === option.value ? 'selected' : ''}
              key={option.value}
            >
              <input
                className="quote-visually-hidden"
                type="radio"
                name={inputName}
                value={option.value}
                checked={selected?.value === option.value}
                onChange={() => onSelect(option)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
