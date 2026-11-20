import { PeruActivaQuotationPage } from './PeruActivaQuotationPage';
import { PeruActivaOrderLayout } from './PeruActivaOrderLayout';
import { OrderAssignmentPanel } from './OrderAssignmentPanel';

export function PeruActivaOrderPage({ reference }: { reference: string }) {
  if (reference.startsWith('COT-')) return <PeruActivaQuotationPage quotationId={reference} />;
  return (
    <PeruActivaOrderLayout>
      <header className="pa-order-heading">
        <div>
          <h1>Orden de producción</h1>
          <p>{reference}</p>
        </div>
      </header>
      <OrderAssignmentPanel orderId={reference} />
    </PeruActivaOrderLayout>
  );
}
