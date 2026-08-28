import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddGarmentSelect } from './AddGarmentSelect';

describe('AddGarmentSelect', () => {
  it('muestra directamente la lista nativa y agrega con una sola selección', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<AddGarmentSelect disabled={false} onAdd={onAdd} />);

    expect(screen.queryByRole('button')).toBeNull();
    const select = screen.getByRole('combobox', { name: 'Agregar prenda' });
    expect(screen.queryByRole('option', { name: 'Buzo' })).toBeNull();
    await user.selectOptions(select, 'polo');

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onAdd).toHaveBeenCalledWith('polo');
  });
});
