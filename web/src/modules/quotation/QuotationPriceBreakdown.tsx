import type { QuotationRequest } from '../../../../src/domain/quotation-requests';
import { QuotationAmounts } from './QuotationAmounts';
import { moneyCents } from '../../../../src/domain/quotation-pricing';

export function QuotationPriceBreakdown({ request }: { request: QuotationRequest }) {
  if (!request.quotation) return null;
  const garments = [request.request.garment, ...request.request.additionalGarments];

  return (
    <div className="quote-price-breakdown">
      {request.quotation.taxMode && (
        <small>
          Precios unitarios {request.quotation.taxMode === 'included' ? 'con IGV' : 'sin IGV'}
        </small>
      )}
      {request.quotation.lineItems?.map((item) => {
        const garment = garments[item.garmentIndex];
        if (!garment) return null;
        return (
          <div key={item.garmentIndex}>
            <span>
              {garment.product === 'polo' ? 'Polos' : 'Buzos'} · {garment.quantity} × S/{' '}
              {item.unitPricePEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
              {item.selectedFabric && (
                <small style={{ display: 'block' }}>{item.selectedFabric}</small>
              )}
            </span>
            <b>
              S/{' '}
              {(moneyCents(garment.quantity * item.unitPricePEN) / 100).toLocaleString('es-PE', {
                minimumFractionDigits: 2,
              })}
            </b>
          </div>
        );
      })}
      <QuotationAmounts
        amount={request.quotation.priceAmountPEN ?? request.quotation.totalPricePEN}
        taxMode={request.quotation.taxMode}
        taxRate={request.quotation.taxRate}
      />
    </div>
  );
}
