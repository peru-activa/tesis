import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FabricPicker } from './FabricPicker';
import type { FabricOption } from './quotationCatalog';
afterEach(cleanup);
it('offers a catalog fabric without inventing a sample image', () => {
  const fabric: FabricOption = {
    name: 'Tela de prueba',
    title: 'Tela de prueba',
    description: 'Sin muestra',
    benefit: '',
    specification: '',
    alt: 'Muestra pendiente',
  };
  const onSelect = vi.fn();
  render(
    <FabricPicker
      inputName="fabric"
      options={[fabric]}
      selected={fabric}
      selectedName={fabric.name}
      isProposal={false}
      isCustom={false}
      isOpen={true}
      onToggle={vi.fn()}
      onPreview={vi.fn()}
      onSelect={onSelect}
      onSelectProposal={vi.fn()}
      onSelectCustom={vi.fn()}
      onCustomNameChange={vi.fn()}
      onCustomNameCommit={vi.fn()}
    />,
  );
  expect(screen.getByRole('radio', { name: /Tela de prueba/ })).toBeTruthy();
  expect(screen.queryAllByRole('img')).toHaveLength(0);
  expect(screen.getAllByLabelText('Muestra no disponible')).toHaveLength(2);
});
