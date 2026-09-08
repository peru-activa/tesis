import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignPlacementPreview } from './DesignPlacementPreview';

afterEach(cleanup);

const imageAttachment = {
  name: 'logo.png',
  mediaType: 'image/png' as const,
  sizeBytes: 120,
  dataUrl: 'data:image/png;base64,AA==',
};

describe('DesignPlacementPreview', () => {
  it('permite cambiar la superficie del diseño a la espalda', async () => {
    const user = userEvent.setup();
    const onPlacementChange = vi.fn();
    render(
      <DesignPlacementPreview
        attachment={imageAttachment}
        applications={[
          { attachment: imageAttachment, placement: 'Frente · posición 52%, 40% · tamaño 16%' },
        ]}
        activeApplication={0}
        color="#C5212E"
        placement="Frente · posición 52%, 40% · tamaño 16%"
        onSelectApplication={vi.fn()}
        onAddApplication={vi.fn()}
        onDeleteApplication={vi.fn()}
        onRequestUpload={vi.fn()}
        onSizeChange={vi.fn()}
        onPlacementChange={onPlacementChange}
      />,
    );

    expect(screen.getByRole('img', { name: 'Diseño adjunto: logo.png' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Espalda' }));

    expect(onPlacementChange).toHaveBeenCalledWith('Espalda · posición 52%, 40% · tamaño 16%');
    expect(screen.getByText('Vista posterior referencial')).toBeTruthy();
  });

  it('arrastra el logo y guarda sus coordenadas', () => {
    const onPlacementChange = vi.fn();
    render(
      <DesignPlacementPreview
        attachment={imageAttachment}
        applications={[
          { attachment: imageAttachment, placement: 'Frente · posición 52%, 40% · tamaño 16%' },
        ]}
        activeApplication={0}
        color="#C5212E"
        placement="Frente · posición 52%, 40% · tamaño 16%"
        onSelectApplication={vi.fn()}
        onAddApplication={vi.fn()}
        onDeleteApplication={vi.fn()}
        onRequestUpload={vi.fn()}
        onSizeChange={vi.fn()}
        onPlacementChange={onPlacementChange}
      />,
    );
    const canvas = screen.getByTestId('design-canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ width: 400, height: 400, left: 0, top: 0, right: 400, bottom: 400 }),
    });
    Object.defineProperty(canvas, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(canvas, 'releasePointerCapture', { value: vi.fn() });

    fireEvent.pointerDown(screen.getByRole('group', { name: /Logo movible/i }), {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 120 });

    expect(onPlacementChange).toHaveBeenLastCalledWith('Frente · posición 62%, 45% · tamaño 16%');
  });

  it('confirma un PDF sin inventar una representación visual', () => {
    render(
      <DesignPlacementPreview
        attachment={{ ...imageAttachment, name: 'logo.pdf', mediaType: 'application/pdf' }}
        applications={[
          {
            attachment: { ...imageAttachment, name: 'logo.pdf', mediaType: 'application/pdf' },
            placement: 'Frente · posición 52%, 40% · tamaño 16%',
          },
        ]}
        activeApplication={0}
        color=""
        placement=""
        onSelectApplication={vi.fn()}
        onAddApplication={vi.fn()}
        onDeleteApplication={vi.fn()}
        onRequestUpload={vi.fn()}
        onSizeChange={vi.fn()}
        onPlacementChange={vi.fn()}
      />,
    );

    expect(screen.getByText('PDF')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Diseño adjunto/ })).toBeNull();
  });

  it('muestra la maqueta y orienta al cliente antes de adjuntar un archivo', () => {
    const onRequestUpload = vi.fn();
    const onAddApplication = vi.fn();
    render(
      <DesignPlacementPreview
        attachment={undefined}
        applications={[
          {
            attachment: imageAttachment,
            placement: 'Frente · posición 30%, 40% · tamaño 16%',
          },
          {
            attachment: { ...imageAttachment, name: 'logo-2.png' },
            placement: 'Frente · posición 70%, 40% · tamaño 16%',
          },
          { attachment: undefined, placement: '' },
        ]}
        activeApplication={2}
        color=""
        placement=""
        onSelectApplication={vi.fn()}
        onAddApplication={onAddApplication}
        onDeleteApplication={vi.fn()}
        onRequestUpload={onRequestUpload}
        onSizeChange={vi.fn()}
        onPlacementChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agregar logo o diseño' }));
    expect(onRequestUpload).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Agregar otro logo/i }));
    expect(onAddApplication).toHaveBeenCalledOnce();
    expect(screen.getByText('Agrega el logo 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar Logo 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar Logo 2' })).toBeTruthy();
    expect(screen.getAllByRole('img', { name: /Diseño adjunto/ })).toHaveLength(2);
    expect(screen.queryByText('Esta vista representa ubicación y proporción.')).toBeNull();
    expect(
      screen.getByRole('region', { name: 'Vista previa referencial del diseño' }),
    ).toBeTruthy();
  });
});
