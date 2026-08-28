import type { QuotationRequest } from '../../../../src/domain/quotation-requests';

export function QuotationPriceBreakdown({ request }: { request: QuotationRequest }) {
  if (!request.quotation) return null;
  const garments = [request.request.garment, ...request.request.additionalGarments];

  return (
    <div className="quote-price-breakdown">
      {request.quotation.lineItems?.map((item) => {
        const garment = garments[item.garmentIndex];
        if (!garment) return null;
        return (
          <div key={item.garmentIndex}>
            <span>
              {garment.product === 'polo' ? 'Polos' : 'Buzos'} · {garment.quantity} × S/{' '}
              {item.unitPricePEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
            </span>
            <b>
              S/{' '}
              {(garment.quantity * item.unitPricePEN).toLocaleString('es-PE', {
                minimumFractionDigits: 2,
              })}
            </b>
          </div>
        );
      })}
      <div className="total">
        <span>Total</span>
        <strong>
          S/{' '}
          {request.quotation.totalPricePEN.toLocaleString('es-PE', {
            minimumFractionDigits: 2,
          })}
        </strong>
      </div>
    </div>
  );
}
