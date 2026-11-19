import { ChoiceTransition, SelectionMark, confirmRadioChoice } from './ChoiceTransition';
import type { PoloCollarOption } from './quotationCatalog';

interface CollarPickerProps {
  inputName: string;
  validationFields?: string;
  options: readonly PoloCollarOption[];
  selected?: PoloCollarOption;
  expanded: boolean;
  confirmed?: boolean;
  onEdit: () => void;
  onPreview: (option: PoloCollarOption) => void;
  onSelect: (option: PoloCollarOption) => void;
}

export function CollarPicker({
  inputName,
  validationFields,
  options,
  selected,
  expanded,
  confirmed,
  onEdit,
  onPreview,
  onSelect,
}: CollarPickerProps) {
  return (
    <fieldset data-validation-fields={validationFields}>
      <legend className="quote-field-label">Tipo de cuello</legend>
      <ChoiceTransition
        expanded={expanded}
        confirmed={confirmed}
        summary={
          selected ? (
            <div className="quote-selected-fabric quote-selected-collar">
              <SelectionMark />
              <img src={selected.image} alt="" />
              <div>
                <strong>{selected.value}</strong>
                <small>Cuello</small>
              </div>
              <button type="button" onClick={onEdit}>
                Cambiar
              </button>
            </div>
          ) : null
        }
      >
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
                onKeyDown={(event) =>
                  confirmRadioChoice(event, event.currentTarget.checked, () => onSelect(option))
                }
                onClick={() => {
                  if (selected?.value === option.value) onSelect(option);
                }}
              />
              <img src={option.image} alt="" />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </ChoiceTransition>
    </fieldset>
  );
}
