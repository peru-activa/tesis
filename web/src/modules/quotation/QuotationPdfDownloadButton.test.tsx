import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuotationPdfDownloadButton } from './QuotationPdfDownloadButton';

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:pdf-test');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('descargar cotización', () => {
  it('muestra preparación, evita descargas duplicadas y confirma solo el inicio', async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    render(<QuotationPdfDownloadButton quotationId="COT-TEST" fetcher={fetcher} />);
    await user.click(screen.getByRole('button', { name: 'Descargar cotización PDF' }));
    expect(screen.getByRole('button', { name: 'Preparando PDF…' }).hasAttribute('disabled')).toBe(
      true,
    );
    await user.click(screen.getByRole('button', { name: 'Preparando PDF…' }));
    expect(fetcher).toHaveBeenCalledOnce();
    resolve(new Response('%PDF-1.7 test', { headers: { 'content-type': 'application/pdf' } }));
    await screen.findByRole('button', { name: 'PDF listo' });
    expect(screen.getByRole('status').textContent).toContain('La descarga se ha iniciado');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });
  it('no descarga una página de error y permite reintentar', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('login', { headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(
        new Response('%PDF-1.7 test', { headers: { 'content-type': 'application/pdf' } }),
      );
    render(<QuotationPdfDownloadButton quotationId="COT-TEST" fetcher={fetcher} />);
    await user.click(screen.getByRole('button', { name: 'Descargar cotización PDF' }));
    await screen.findByRole('alert');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Descargar cotización PDF' }));
    await screen.findByRole('button', { name: 'PDF listo' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('cancela una preparación al salir de la pantalla', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}),
    );
    const { unmount } = render(
      <QuotationPdfDownloadButton quotationId="COT-TEST" fetcher={fetcher} />,
    );
    await user.click(screen.getByRole('button', { name: 'Descargar cotización PDF' }));
    unmount();
    await waitFor(() => expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true));
  });
});
