import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryEstimate } from '../../../../src/domain/delivery-estimate';
import { createEmptyDraft } from './quotationFormModel';
import { DeliveryDateField } from './DeliveryDateField';
import { useDeliveryEstimate } from './useDeliveryEstimate';

const draft = createEmptyDraft('2099-12-01');
draft.garment = {
  ...draft.garment,
  model: 'Cuello redondo',
  fabric: { mode: 'specified', name: 'Algodón' },
};
const estimate: DeliveryEstimate = {
  status: 'available',
  earliestDate: '2099-12-10',
  approvalBy: '2099-12-02',
  evaluatedAt: '2099-11-30T15:00:00Z',
  horizonDate: '2100-05-29',
  materialPending: false,
  policy: {
    version: 'test',
    approvalDays: 2,
    deliveryDays: 1,
    handoffDays: 1,
    horizonDays: 180,
    maximumPlanEvaluations: 10_000,
  },
};
const response = (value = estimate) => ({ ok: true, json: async () => ({ estimate: value }) });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('delivery estimate calendar', () => {
  it('waits for the result, sets the server minimum and excludes customer data and images', async () => {
    let finish!: (value: unknown) => void;
    const fetch = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetch);
    function Calendar() {
      const form = useForm({ defaultValues: draft });
      const availability = useDeliveryEstimate(draft, true);
      return (
        <FormProvider {...form}>
          <DeliveryDateField availability={availability} />
        </FormProvider>
      );
    }
    render(<Calendar />);
    const calendar = screen.getByLabelText('Fecha de entrega') as HTMLInputElement;
    expect(calendar.disabled).toBe(true);
    expect(screen.getByText(/Calculando la primera/)).toBeTruthy();
    await act(async () => {
      finish(response());
    });
    expect(calendar.disabled).toBe(false);
    expect(calendar.min).toBe('2099-12-10');
    expect(screen.getByText(/si apruebas hasta el 2 de diciembre/)).toBeTruthy();
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.customer).toBeUndefined();
    expect(body.delivery).toBeUndefined();
    expect(body.garment.designAttachment).toBeUndefined();
  });

  it('discards stale replies after a quantity change and does not refetch on contact edits', async () => {
    const pending: Array<(value: unknown) => void> = [];
    const fetch = vi.fn().mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    vi.stubGlobal('fetch', fetch);
    const { result, rerender } = renderHook(({ value }) => useDeliveryEstimate(value, true), {
      initialProps: { value: draft },
    });
    rerender({ value: { ...draft, garment: { ...draft.garment, quantity: 100 } } });
    expect(result.current.ready).toBe(false);
    await act(async () => {
      pending[1]!(response({ ...estimate, earliestDate: '2099-12-20' }));
    });
    expect(result.current.estimate?.earliestDate).toBe('2099-12-20');
    await act(async () => {
      pending[0]!(response());
    });
    expect(result.current.estimate?.earliestDate).toBe('2099-12-20');
    rerender({
      value: {
        ...draft,
        garment: { ...draft.garment, quantity: 100 },
        customer: { ...draft.customer, contactName: 'Otra persona' },
      },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps selection blocked on errors, permits retry and blocks when no route exists', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ ...estimate, status: 'unavailable', earliestDate: null }));
    vi.stubGlobal('fetch', fetch);
    const { result, rerender } = renderHook(
      ({ revision }) => useDeliveryEstimate(draft, true, revision),
      { initialProps: { revision: 0 } },
    );
    await waitFor(() => expect(result.current.error).toBe('Sin conexión'));
    expect(result.current.ready).toBe(false);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.ready).toBe(true));
    rerender({ revision: 1 });
    await waitFor(() => expect(result.current.estimate?.status).toBe('unavailable'));
    expect(result.current.ready).toBe(false);
  });
});
