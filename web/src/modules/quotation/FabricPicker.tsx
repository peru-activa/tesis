import { useEffect, useRef } from 'react';
import type { FabricOption } from './quotationCatalog';

interface FabricPickerProps {
  inputName: string;
  options: readonly FabricOption[];
  selected?: FabricOption;
  selectedName?: string;
  isProposal: boolean;
  isCustom: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onPreview: (option: FabricOption) => void;
  onSelect: (option: FabricOption) => void;
  onSelectProposal: () => void;
  onSelectCustom: () => void;
  onCustomNameChange: (value: string) => void;
  onCustomNameCommit: () => void;
}

export function FabricPicker({
  inputName,
  options,
  selected,
  selectedName,
  isProposal,
  isCustom,
  isOpen,
  onToggle,
  onPreview,
  onSelect,
  onSelectProposal,
  onSelectCustom,
  onCustomNameChange,
  onCustomNameCommit,
}: FabricPickerProps) {
  const customInputRef = useRef<HTMLInputElement>(null);
  const hasSelection = Boolean(selected || isProposal || (isCustom && selectedName?.trim()));
  const title = isProposal
    ? 'Por recomendar'
    : (selected?.title ?? (isCustom ? selectedName?.trim() || 'Otra tela' : 'Elige una tela'));
  const description = isProposal
    ? 'Perú Activa propondrá una opción'
    : (selected?.description ?? (isCustom ? 'Tela especificada' : 'Selecciona una opción'));

  useEffect(() => {
    if (isCustom && !selectedName) customInputRef.current?.focus();
  }, [isCustom, selectedName]);

  return (
    <fieldset>
      <legend className="quote-field-label">Tela / calidad</legend>
      <div className="quote-selected-fabric">
        {selected ? (
          <img src={selected.image} alt="" />
        ) : (
          <span className="quote-fabric-placeholder">?</span>
        )}
        <div>
          <strong>{title}</strong>
          <small>{description}</small>
        </div>
        <button type="button" aria-expanded={isOpen} onClick={onToggle}>
          {isOpen ? 'Cerrar' : hasSelection ? 'Cambiar tela' : 'Elegir tela'}
        </button>
      </div>

      {isOpen && (
        <div className="quote-fabric-picker-panel">
          <div className="quote-image-option-grid fabrics">
            {options.map((option) => (
              <label
                className={selected?.name === option.name ? 'selected' : ''}
                key={option.name}
                onFocus={() => onPreview(option)}
                onMouseEnter={() => onPreview(option)}
              >
                <input
                  className="quote-visually-hidden"
                  type="radio"
                  name={inputName}
                  value={option.name}
                  checked={selected?.name === option.name}
                  onChange={() => onSelect(option)}
                />
                <img src={option.image} alt="" />
                <span>
                  {option.title}
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="quote-fabric-actions">
            <label className={isProposal ? 'selected' : ''}>
              <input
                className="quote-visually-hidden"
                type="radio"
                name={inputName}
                value="proposal"
                checked={isProposal}
                onChange={onSelectProposal}
              />
              No sé cuál elegir
            </label>
            <label className={isCustom ? 'selected' : ''}>
              <input
                className="quote-visually-hidden"
                type="radio"
                name={inputName}
                value="custom"
                checked={isCustom}
                onChange={onSelectCustom}
              />
              Otra tela
            </label>
          </div>
        </div>
      )}

      {isCustom && (
        <label className="quote-field">
          <span className="quote-field-label">¿Qué tela necesitas?</span>
          <span className="quote-control">
            <input
              ref={customInputRef}
              value={selectedName ?? ''}
              onChange={(event) => onCustomNameChange(event.target.value)}
              onBlur={onCustomNameCommit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              placeholder="Escribe el nombre de la tela"
            />
          </span>
        </label>
      )}
    </fieldset>
  );
}
