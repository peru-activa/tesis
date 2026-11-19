import { ChoiceTransition, SelectionMark, confirmRadioChoice } from './ChoiceTransition';
import type { TextOption } from './quotationCatalog';

interface TextOptionPickerProps<T extends string> {
  inputName: string;
  validationFields?: string;
  legend: string;
  summaryLabel: string;
  options: readonly TextOption<T>[];
  selected?: TextOption<T>;
  expanded: boolean;
  confirmed?: boolean;
  onEdit: () => void;
  onPreview: (option: TextOption<T>) => void;
  onPreviewEnd: () => void;
  onSelect: (option: TextOption<T>) => void;
}

export function TextOptionPicker<T extends string>({
  inputName,
  validationFields,
  legend,
  summaryLabel,
  options,
  selected,
  expanded,
  confirmed,
  onEdit,
  onPreview,
  onPreviewEnd,
  onSelect,
}: TextOptionPickerProps<T>) {
  return (
    <fieldset data-validation-fields={validationFields}>
      <legend className="quote-field-label">{legend}</legend>
      <ChoiceTransition
        expanded={expanded}
        confirmed={confirmed}
        summary={
          selected ? (
            <div className="quote-selected-text-option">
              <SelectionMark />
              <span>
                <strong>{selected.label}</strong>
                <small>{summaryLabel}</small>
              </span>
              <button type="button" onClick={onEdit}>
                Cambiar
              </button>
            </div>
          ) : null
        }
      >
        <div className="quote-text-option-grid" onMouseLeave={onPreviewEnd}>
          {options.map((option) => (
            <label
              className={selected?.value === option.value ? 'selected' : ''}
              key={option.value}
              onBlur={onPreviewEnd}
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
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </ChoiceTransition>
    </fieldset>
  );
}
