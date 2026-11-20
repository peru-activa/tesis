export const IGV_RATE = 0.18;
export type QuotationTaxMode = 'included' | 'not_included';

/** Round once per commercial line, then operate on integer cents. */
export function moneyCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('invalid_price');
  return Math.round((value + Number.EPSILON) * 100);
}

export function quotationPricing(
  enteredAmount: number,
  mode?: QuotationTaxMode,
  rate = IGV_RATE,
) {
  const entered = moneyCents(enteredAmount);
  const base = mode === 'included' ? Math.round(entered / (1 + rate)) : entered;
  const tax = !mode ? 0 : mode === 'included' ? entered - base : Math.round(base * rate);
  return {
    enteredPricePEN: entered / 100,
    subtotalPEN: base / 100,
    taxPEN: tax / 100,
    totalPricePEN: (base + tax) / 100,
    rate,
  };
}

export function quotationLineAmount(
  quantities: readonly number[],
  lines: readonly { garmentIndex: number; unitPricePEN: number }[],
): number {
  return lines.reduce((sum, line) => sum + moneyCents((quantities[line.garmentIndex] ?? 0) * line.unitPricePEN), 0) / 100;
}
