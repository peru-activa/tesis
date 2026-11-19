import { useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import {
  fabricsByProduct,
  findFabricOption,
  findPoloPreview,
  poloCollars,
  poloCuts,
  poloSleeves,
  type FabricOption,
  type PoloCollarOption,
  type PoloCut,
  type PoloSleeve,
  type TextOption,
} from './quotationCatalog';
import {
  hasCompleteGarmentOptions,
  garmentField,
  type Garment,
  type GarmentPath,
} from './quotationFormModel';

type EditorMode = 'collar' | 'cut' | 'sleeve' | 'fabric' | 'custom-fabric' | 'complete';

export function useGarmentConfiguration(garment: Garment, path: GarmentPath) {
  const { setValue } = useFormContext<QuotationRequestDraft>();
  const optionsScrollRef = useRef<HTMLDivElement>(null);
  const cutSectionRef = useRef<HTMLDivElement>(null);
  const sleeveSectionRef = useRef<HTMLDivElement>(null);
  const fabricSectionRef = useRef<HTMLDivElement>(null);
  const fabricOptions = fabricsByProduct[garment.product];
  const fabricName = garment.fabric.mode === 'specified' ? garment.fabric.name : undefined;
  const selectedFabric = findFabricOption(garment.product, fabricName);
  const selectedCollar = poloCollars.find((option) => option.value === garment.model);
  const selectedCut = poloCuts.find((option) => option.value === garment.cut);
  const selectedSleeve = poloSleeves.find((option) => option.value === garment.sleeve);
  const [editorMode, setEditorMode] = useState<EditorMode>(() =>
    initialEditorMode(
      garment,
      Boolean(selectedCollar),
      Boolean(selectedCut),
      Boolean(selectedSleeve),
      Boolean(selectedFabric),
    ),
  );
  const [lastConfirmed, setLastConfirmed] = useState<EditorMode>();
  const [previewedCollar, setPreviewedCollar] = useState<PoloCollarOption>();
  const [previewedCut, setPreviewedCut] = useState<TextOption<PoloCut>>();
  const [previewedSleeve, setPreviewedSleeve] = useState<TextOption<PoloSleeve>>();
  const [previewedFabric, setPreviewedFabric] = useState<FabricOption>();

  const fabricPickerOpen = editorMode === 'fabric';
  const editingCustomFabric = editorMode === 'custom-fabric';
  const customFabric =
    editingCustomFabric ||
    (garment.fabric.mode === 'specified' && Boolean(fabricName?.trim()) && !selectedFabric);
  const previewCollar = previewedCollar ?? selectedCollar ?? poloCollars[0];
  const previewCut = previewedCut ?? selectedCut;
  const previewSleeve = previewedSleeve ?? selectedSleeve;
  const previewFabric = previewedFabric ?? selectedFabric;
  const configurationComplete = hasCompleteGarmentOptions(garment);
  const optionsExpanded = editorMode !== 'complete';
  const productLabel = garment.product === 'polo' ? 'Polo' : 'Buzo';
  const fabricLabel =
    garment.fabric.mode === 'proposal'
      ? 'Tela por recomendar'
      : (selectedFabric?.title ?? fabricName);
  const title =
    garment.product === 'polo'
      ? [
          productLabel,
          selectedCollar?.value,
          selectedCut?.label,
          selectedSleeve?.label,
          !optionsExpanded ? fabricLabel : undefined,
        ]
          .filter(Boolean)
          .join(' · ')
      : [productLabel, !optionsExpanded ? fabricLabel : undefined].filter(Boolean).join(' · ');
  const previewFabricTitle =
    previewedFabric?.title ??
    (garment.fabric.mode === 'proposal'
      ? 'Tela por recomendar'
      : (selectedFabric?.title ?? (customFabric ? fabricName : undefined)));
  const poloPreview = findPoloPreview({
    model: previewCollar.value,
    cut: previewCut?.value,
    sleeve: previewSleeve?.value,
  });
  const previewImage =
    garment.product === 'polo' ? (poloPreview?.image ?? '') : (previewFabric?.image ?? '');
  const previewAlt =
    garment.product === 'polo' ? (poloPreview?.alt ?? '') : (previewFabric?.alt ?? '');
  const previewTitle =
    garment.product === 'polo'
      ? [previewCollar.value, previewCut?.label, previewSleeve?.label].filter(Boolean).join(' · ')
      : productLabel;

  useEffect(() => {
    const target =
      editorMode === 'cut'
        ? cutSectionRef.current
        : editorMode === 'sleeve'
          ? sleeveSectionRef.current
          : editorMode === 'fabric'
            ? fabricSectionRef.current
            : null;
    if (!target) return;

    const frame = requestAnimationFrame(() => {
      const container = optionsScrollRef.current;
      if (!container) return;

      const targetBox = target.getBoundingClientRect();
      const containerBox = container.getBoundingClientRect();
      const minimumVisible = Math.min(targetBox.height, 140);
      const delta =
        targetBox.top < containerBox.top
          ? targetBox.top - containerBox.top
          : Math.max(0, targetBox.top + minimumVisible - containerBox.bottom);
      if (delta)
        container.scrollTo({
          top: container.scrollTop + delta,
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        });
      if (lastConfirmed && !target.contains(document.activeElement)) {
        const legend = target.querySelector('legend');
        if (legend) {
          legend.tabIndex = -1;
          legend.focus({ preventScroll: true });
        }
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [editorMode, lastConfirmed]);

  function selectCollar(option: PoloCollarOption) {
    setLastConfirmed('collar');
    setPreviewedCollar(option);
    setValue(garmentField(path, 'model'), option.value, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setEditorMode('cut');
  }

  function selectCut(option: TextOption<PoloCut>) {
    setLastConfirmed('cut');
    setPreviewedCut(undefined);
    setValue(garmentField(path, 'cut'), option.value, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(garmentField(path, 'audience'), option.value === 'princesa_dama' ? 'dama' : 'unisex', {
      shouldDirty: true,
      shouldValidate: true,
    });
    setEditorMode('sleeve');
  }

  function selectSleeve(option: TextOption<PoloSleeve>) {
    setLastConfirmed('sleeve');
    setPreviewedSleeve(undefined);
    setValue(garmentField(path, 'sleeve'), option.value, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setEditorMode('fabric');
  }

  function selectFabric(option: FabricOption) {
    setLastConfirmed('fabric');
    setPreviewedFabric(option);
    setValue(
      garmentField(path, 'fabric'),
      { mode: 'specified', name: option.name },
      { shouldDirty: true, shouldValidate: true },
    );
    setEditorMode('complete');
  }

  function selectFabricProposal() {
    setLastConfirmed('fabric');
    setPreviewedFabric(undefined);
    setValue(
      garmentField(path, 'fabric'),
      { mode: 'proposal' },
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
    setEditorMode('complete');
  }

  function selectCustomFabric() {
    setPreviewedFabric(undefined);
    setValue(
      garmentField(path, 'fabric'),
      { mode: 'specified', name: '' },
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
    setEditorMode('custom-fabric');
  }

  function toggleFabricPicker() {
    setEditorMode((mode) => {
      if (mode !== 'fabric') return 'fabric';
      if (configurationComplete) {
        setPreviewedFabric(undefined);
        return 'complete';
      }
      return garment.product === 'polo' ? 'sleeve' : 'fabric';
    });
  }

  function changeCustomFabricName(name: string) {
    setValue(
      garmentField(path, 'fabric'),
      { mode: 'specified', name },
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
  }

  function commitCustomFabric() {
    if ((fabricName?.trim().length ?? 0) >= 2) {
      setLastConfirmed('fabric');
      setEditorMode('complete');
    }
  }

  return {
    configurationComplete,
    lastConfirmed,
    collarOptions: poloCollars,
    commitCustomFabric,
    customFabric,
    cutOptions: poloCuts,
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
    sleeveOptions: poloSleeves,
    sleeveSectionRef,
    title,
    toggleFabricPicker,
    changeCustomFabricName,
  };
}

function initialEditorMode(
  garment: Garment,
  hasCollar: boolean,
  hasCut: boolean,
  hasSleeve: boolean,
  hasCatalogFabric: boolean,
): EditorMode {
  if (garment.product === 'polo') {
    if (!hasCollar) return 'collar';
    if (!hasCut) return 'cut';
    if (!hasSleeve) return 'sleeve';
  }
  if (garment.fabric.mode === 'proposal') return 'complete';
  if (hasCatalogFabric || garment.fabric.name.trim().length >= 2) return 'complete';
  return 'fabric';
}
