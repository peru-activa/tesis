import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerRegistrationGate } from './CustomerRegistrationGate';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => promise),
  );
  return resolve;
}

function gate() {
  return <CustomerRegistrationGate>{() => <p>Formulario del pedido</p>}</CustomerRegistrationGate>;
}

describe('account loading', () => {
  it('skips the loading message on a fast response and opens the request form', async () => {
    vi.useFakeTimers();
    const resolve = deferredResponse();
    render(gate());
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      resolve(Response.json({ required: false, email: 'cliente@example.test' }));
    });
    expect(screen.getByText('Formulario del pedido')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a small delayed status and still requires registration when appropriate', async () => {
    vi.useFakeTimers();
    const resolve = deferredResponse();
    render(gate());
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status').textContent).toBe('Cargando tu cuenta…');
    expect(screen.queryByRole('heading')).toBeNull();
    await act(async () => {
      resolve(
        Response.json({
          required: true,
          email: 'nuevo@example.test',
          notice: { version: '3', summary: [], documentUrl: '/v1/consent-documents/3' },
        }),
      );
    });
    expect(screen.getByRole('heading', { name: 'Registra tu cuenta' })).toBeTruthy();
    expect(screen.queryByText('Formulario del pedido')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('replaces loading with the error instead of showing protected content', async () => {
    vi.useFakeTimers();
    const resolve = deferredResponse();
    render(gate());
    await act(async () => {
      resolve(new Response(null, { status: 401 }));
    });
    expect(screen.getByRole('alert').textContent).toContain('No pudimos comprobar');
    expect(screen.queryByText('Formulario del pedido')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
