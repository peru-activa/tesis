import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColorPicker } from './ColorPicker';

afterEach(cleanup);

describe('ColorPicker', () => {
  it('shows the color disclaimer only when the selector opens and confirms the hex value', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="" onChange={onChange} />);

    expect(screen.getByText('Elegir color')).toBeTruthy();
    expect(screen.getByText('Color de la prenda')).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /elegir color/i }));

    expect(screen.getByRole('dialog', { name: 'Elige el color de la prenda' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain(
      'El color en pantalla es referencial y está sujeto a disponibilidad de la tela seleccionada.',
    );
    expect(screen.getByRole('note').textContent).toContain(
      'Después de firmar el contrato, recibirás sin costo una muestra física para aprobar el color final antes de producir.',
    );

    fireEvent.change(screen.getByLabelText('Seleccionar color'), {
      target: { value: '#c5212e' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Usar este color' }));

    expect(onChange).toHaveBeenCalledWith('#C5212E');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps showing a legacy written color until the user changes it', () => {
    render(<ColorPicker value="azul marino" onChange={() => undefined} />);

    expect(screen.getByText('azul marino')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /azul marino/i }));
    expect(screen.getByLabelText('Seleccionar color')).toHaveProperty('value', '#17243a');
  });
});
