import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignLogo } from './DesignLogo';
import { prepareDesignArtwork, type PreparedDesignArtwork } from './designArtwork';
import type { DesignAttachment } from './designAttachment';

vi.mock('./designArtwork', () => ({
  artworkSettings: (attachment: DesignAttachment) =>
    attachment.preview ?? { backgroundMode: 'auto' },
  prepareDesignArtwork: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});
const original: DesignAttachment = {
  name: 'logo.png',
  mediaType: 'image/png',
  sizeBytes: 10,
  dataUrl: 'data:image/png;base64,original',
};

describe('vista compartida del logo', () => {
  it('agrupa ajustes rápidos del recorte y solo prepara la última opción', async () => {
    vi.useFakeTimers();
    vi.mocked(prepareDesignArtwork).mockResolvedValue({
      source: 'data:image/png;base64,limpio',
      background: 'removed',
    });
    const { rerender } = render(<DesignLogo attachment={original} alt="Logo" />);
    for (const tolerance of [20, 30, 40, 50])
      rerender(
        <DesignLogo
          attachment={{ ...original, preview: { backgroundMode: 'remove', tolerance } }}
          alt="Logo"
        />,
      );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(prepareDesignArtwork).toHaveBeenCalledOnce();
    expect(vi.mocked(prepareDesignArtwork).mock.calls[0][0].preview?.tolerance).toBe(50);
    expect(screen.getByRole('img').getAttribute('src')).toBe('data:image/png;base64,limpio');
  });

  it('no muestra el fondo original durante la carga, al cambiar el archivo ni ante un error', async () => {
    vi.useFakeTimers();
    let resolveOld!: (result: PreparedDesignArtwork) => void;
    vi.mocked(prepareDesignArtwork).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    const { rerender } = render(<DesignLogo attachment={original} alt="Logo" />);
    expect(screen.getByRole('img').getAttribute('src')).not.toBe(original.dataUrl);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const next = { ...original, dataUrl: 'data:image/png;base64,nuevo' };
    vi.mocked(prepareDesignArtwork).mockRejectedValueOnce(new Error('Imagen ilegible'));
    rerender(<DesignLogo attachment={next} alt="Logo" />);
    expect(screen.getByRole('img').getAttribute('src')).not.toBe(next.dataUrl);
    await act(async () => {
      resolveOld({ source: 'data:image/png;base64,viejo', background: 'removed' });
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole('img').getAttribute('src')).not.toBe(next.dataUrl);
    expect(screen.getByRole('img').getAttribute('src')).not.toBe('data:image/png;base64,viejo');
    expect(screen.getByRole('img').getAttribute('title')).toContain('No se pudo mostrar');
    expect(screen.getByRole('img').getAttribute('data-artwork-state')).toBe('error');
  });
});
