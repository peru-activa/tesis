import type { ReactNode } from 'react';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import { OrderIcon } from './OrderIcon';
import './multichannel.css';
import './order-detail.css';

export function PeruActivaOrderLayout({ children }: { children: ReactNode }) {
  return (
    <div className="quote-demo mc-shell pa-operations">
      <PeruActivaHeader homeHref="/peru-activa" />
      <main className="pa-order-detail">
        <a className="pa-back-link" href="/peru-activa" target="_self">
          <OrderIcon name="arrow" />
          Pedidos
        </a>
        {children}
      </main>
    </div>
  );
}
