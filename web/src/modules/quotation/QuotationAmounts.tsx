import { quotationPricing, type QuotationTaxMode } from '../../../../src/domain/quotation-pricing';

export function QuotationAmounts({
  amount,
  taxMode,
  taxRate,
}: {
  amount: number;
  taxMode?: QuotationTaxMode;
  taxRate?: number;
}) {
  const price = quotationPricing(amount, taxMode, taxRate);
  const money = (value: number) =>
    `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <>
      {taxMode && (
        <>
          <div>
            <span>Subtotal sin IGV</span>
            <b>{money(price.subtotalPEN)}</b>
          </div>
          <div>
            <span>IGV {Math.round(price.rate * 100)} %</span>
            <b>{money(price.taxPEN)}</b>
          </div>
        </>
      )}
      <div className="total">
        <span>Total</span>
        <strong>{money(price.totalPricePEN)}</strong>
      </div>
    </>
  );
}
