import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColorPicker } from './ColorPicker';

describe('ColorPicker', () => {
  it('starts without choosing a color and returns the selected hex value', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="" onChange={onChange} />);

    const input = screen.getByLabelText('Elegir color');
    expect(screen.getByText('Elegir color')).toBeTruthy();

    fireEvent.change(input, { target: { value: '#c5212e' } });

    expect(onChange).toHaveBeenCalledWith('#C5212E');
  });

  it('keeps showing a legacy written color until the user changes it', () => {
    render(<ColorPicker value="azul marino" onChange={() => undefined} />);

    expect(screen.getByText('azul marino')).toBeTruthy();
    expect(screen.getByLabelText('Cambiar color')).toHaveProperty('value', '#17243a');
  });
});
