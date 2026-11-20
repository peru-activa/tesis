import { useLayoutEffect } from 'react';
import { SelectionMark } from './ChoiceTransition';
import { hasValidGarmentQuantity } from './quotationFormModel';
import { CollarPicker } from './CollarPicker';
import { FabricPicker } from './FabricPicker';
import { GarmentPreview } from './GarmentPreview';
import { InputField } from './QuoteUi';
import type { Garment, GarmentPath } from './quotationFormModel';
import { TextOptionPicker } from './TextOptionPicker';
import { useGarmentConfiguration } from './useGarmentConfiguration';

interface GarmentCardProps {
  garment: Garment;
  garmentKey: string;
  path: GarmentPath;
  active: boolean;
  onActivate: () => void;
  onChangeQuantity: (value: number) => void;
  onRemove: () => void;
  onConfigurationStateChange: (key: string, ready: boolean) => void;
}

export function GarmentCard({
  garment,
  garmentKey,
  path,
  active,
  onActivate,
  onChangeQuantity,
  onRemove,
  onConfigurationStateChange,
}: GarmentCardProps) {
  const {
    collarOptions,
    configurationComplete,
    lastConfirmed,
    commitCustomFabric,
    customFabric,
    cutOptions,
    cutSectionRef,
    editorMode,
    fabricName,
    fabricOptions,
    fabricPickerOpen,
    fabricSectionRef,
    optionsExpanded,
    optionsScrollRef,
    previewAlt,
    previewFabric,
    previewFabricTitle,
    previewImage,
    previewTitle,
    productLabel,
    selectCollar,
    selectCut,
    selectCustomFabric,
    selectFabric,
    selectFabricProposal,
    selectSleeve,
    selectedCollar,
    selectedCut,
    selectedFabric,
    selectedSleeve,
    setEditorMode,
    setPreviewedCollar,
    setPreviewedCut,
    setPreviewedFabric,
    setPreviewedSleeve,
    sleeveOptions,
    sleeveSectionRef,
    title,
    toggleFabricPicker,
    changeCustomFabricName,
  } = useGarmentConfiguration(garment, path);

  const ready = !optionsExpanded && configurationComplete && hasValidGarmentQuantity(garment);
  useLayoutEffect(() => {
    onConfigurationStateChange(garmentKey, ready);
  }, [garmentKey, ready, onConfigurationStateChange]);

  if (!active) {
    return (
      <button
        type="button"
        className="quote-garment-collapsed"
        data-validation-fields={path}
        data-validation-expand
        onClick={onActivate}
      >
        <span>
          <strong>{title}</strong>
          <small>{garment.quantity} unidades</small>
        </span>
        <b>{ready ? 'Editar' : 'Completar'}</b>
      </button>
    );
  }

  return (
    <section
      className={`quote-garment-row ${!optionsExpanded ? 'completed' : ''}`}
      data-confirmed={lastConfirmed === 'fabric'}
      data-configuration-complete={ready}
    >
      <div className="quote-garment-row-head" data-validation-fields={path}>
        <strong>
          {!optionsExpanded && <SelectionMark />}
          <span className="quote-garment-title">{title}</span>
        </strong>
        <button
          type="button"
          aria-label={`Quitar ${productLabel.toLowerCase()}`}
          title={`Quitar ${productLabel.toLowerCase()}`}
          onClick={onRemove}
        >
          <TrashIcon />
        </button>
      </div>
      <div className="quote-garment-row-body">
        <div className="quote-garment-config">
          <div className="quote-garment-options-scroll" ref={optionsScrollRef}>
            <div className="quote-visual-options">
              {!optionsExpanded ? (
                <div className="quote-completed-controls">
                  <QuantityInput
                    path={path}
                    quantity={garment.quantity}
                    onChange={onChangeQuantity}
                  />
                  <button
                    type="button"
                    className="quote-edit-options"
                    onClick={() => setEditorMode(garment.product === 'polo' ? 'collar' : 'fabric')}
                  >
                    Cambiar opciones
                  </button>
                </div>
              ) : (
                <>
                  {garment.product === 'polo' && (
                    <>
                      <CollarPicker
                        inputName={`${garmentKey}-collar`}
                        validationFields={`${path}.model`}
                        options={collarOptions}
                        selected={selectedCollar}
                        expanded={editorMode === 'collar'}
                        confirmed={lastConfirmed === 'collar'}
                        onEdit={() => setEditorMode('collar')}
                        onPreview={setPreviewedCollar}
                        onSelect={selectCollar}
                      />
                      {selectedCollar && (editorMode !== 'collar' || selectedCut) && (
                        <div
                          ref={cutSectionRef}
                          className="quote-config-next"
                          data-entering={lastConfirmed === 'collar' && editorMode === 'cut'}
                        >
                          <TextOptionPicker
                            inputName={`${garmentKey}-cut`}
                            validationFields={`${path}.cut ${path}.audience`}
                            legend="Corte"
                            summaryLabel="Corte"
                            options={cutOptions}
                            selected={selectedCut}
                            expanded={editorMode === 'cut'}
                            confirmed={lastConfirmed === 'cut'}
                            onEdit={() => setEditorMode('cut')}
                            onPreview={setPreviewedCut}
                            onPreviewEnd={() => setPreviewedCut(undefined)}
                            onSelect={selectCut}
                          />
                        </div>
                      )}
                      {selectedCollar &&
                        selectedCut &&
                        (['sleeve', 'fabric', 'custom-fabric', 'complete'].includes(editorMode) ||
                          selectedSleeve) && (
                          <div
                            ref={sleeveSectionRef}
                            className="quote-config-next"
                            data-entering={lastConfirmed === 'cut' && editorMode === 'sleeve'}
                          >
                            <TextOptionPicker
                              inputName={`${garmentKey}-sleeve`}
                              validationFields={`${path}.sleeve`}
                              legend="Tipo de manga"
                              summaryLabel="Manga"
                              options={sleeveOptions}
                              selected={selectedSleeve}
                              expanded={editorMode === 'sleeve'}
                              confirmed={lastConfirmed === 'sleeve'}
                              onEdit={() => setEditorMode('sleeve')}
                              onPreview={setPreviewedSleeve}
                              onPreviewEnd={() => setPreviewedSleeve(undefined)}
                              onSelect={selectSleeve}
                            />
                          </div>
                        )}
                    </>
                  )}
                  {(garment.product === 'buzo' ||
                    (selectedCollar && selectedCut && selectedSleeve)) &&
                    (configurationComplete ||
                      editorMode === 'fabric' ||
                      editorMode === 'custom-fabric') && (
                      <div
                        ref={fabricSectionRef}
                        className="quote-config-next"
                        data-entering={lastConfirmed === 'sleeve' && editorMode === 'fabric'}
                      >
                        <FabricPicker
                          inputName={`${garmentKey}-fabric`}
                          validationFields={`${path}.fabric`}
                          options={fabricOptions}
                          selected={selectedFabric}
                          selectedName={fabricName}
                          isProposal={garment.fabric.mode === 'proposal'}
                          isCustom={customFabric}
                          isOpen={fabricPickerOpen}
                          onToggle={toggleFabricPicker}
                          onPreview={setPreviewedFabric}
                          onSelect={selectFabric}
                          onSelectProposal={selectFabricProposal}
                          onSelectCustom={selectCustomFabric}
                          onCustomNameChange={changeCustomFabricName}
                          onCustomNameCommit={commitCustomFabric}
                        />
                      </div>
                    )}
                </>
              )}
            </div>
          </div>
        </div>
        {previewImage && (
          <GarmentPreview
            garmentImage={previewImage}
            garmentAlt={previewAlt}
            title={previewTitle}
            fabric={previewFabric}
            fabricTitle={previewFabricTitle}
            fabricMode={fabricPickerOpen}
          />
        )}
      </div>
    </section>
  );
}

function QuantityInput({
  path,
  quantity,
  onChange,
}: {
  path: GarmentPath;
  quantity: number;
  onChange: (value: number) => void;
}) {
  return (
    <InputField label="Cantidad">
      <input
        type="number"
        name={`${path}.quantity`}
        min="1"
        max="5000"
        value={Number.isFinite(quantity) ? quantity : ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? Number.NaN : Number(event.target.value))
        }
      />
    </InputField>
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
