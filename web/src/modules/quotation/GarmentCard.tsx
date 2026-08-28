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
}

export function GarmentCard({
  garment,
  garmentKey,
  path,
  active,
  onActivate,
  onChangeQuantity,
  onRemove,
}: GarmentCardProps) {
  const {
    collarOptions,
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
    setPreviewedFabric,
    sleeveOptions,
    sleeveSectionRef,
    title,
    toggleFabricPicker,
    changeCustomFabricName,
  } = useGarmentConfiguration(garment, path);

  if (!active) {
    return (
      <button type="button" className="quote-garment-collapsed" onClick={onActivate}>
        <span>
          <strong>{title}</strong>
          <small>{garment.quantity} unidades</small>
        </span>
        <b>Editar</b>
      </button>
    );
  }

  return (
    <section className={`quote-garment-row ${!optionsExpanded ? 'completed' : ''}`}>
      <div className="quote-garment-row-head">
        <strong>{title}</strong>
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
                  <QuantityInput quantity={garment.quantity} onChange={onChangeQuantity} />
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
                        options={collarOptions}
                        selected={selectedCollar}
                        expanded={editorMode === 'collar' || !selectedCollar}
                        onEdit={() => setEditorMode('collar')}
                        onPreview={setPreviewedCollar}
                        onSelect={selectCollar}
                      />
                      {selectedCollar && (
                        <div ref={cutSectionRef}>
                          <TextOptionPicker
                            inputName={`${garmentKey}-cut`}
                            legend="Corte"
                            summaryLabel="Corte"
                            options={cutOptions}
                            selected={selectedCut}
                            expanded={editorMode === 'cut' || !selectedCut}
                            onEdit={() => setEditorMode('cut')}
                            onSelect={selectCut}
                          />
                        </div>
                      )}
                      {selectedCollar && selectedCut && (
                        <div ref={sleeveSectionRef}>
                          <TextOptionPicker
                            inputName={`${garmentKey}-sleeve`}
                            legend="Tipo de manga"
                            summaryLabel="Manga"
                            options={sleeveOptions}
                            selected={selectedSleeve}
                            expanded={editorMode === 'sleeve' || !selectedSleeve}
                            onEdit={() => setEditorMode('sleeve')}
                            onSelect={selectSleeve}
                          />
                        </div>
                      )}
                    </>
                  )}
                  {(garment.product === 'buzo' ||
                    (selectedCollar && selectedCut && selectedSleeve)) && (
                    <div ref={fabricSectionRef}>
                      <FabricPicker
                        inputName={`${garmentKey}-fabric`}
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
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (value: number) => void;
}) {
  return (
    <InputField label="Cantidad">
      <input
        type="number"
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
