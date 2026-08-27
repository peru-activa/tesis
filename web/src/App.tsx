import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { QuotationDemo } from './modules/quotation/QuotationDemo';
import { Week02Demo } from './modules/week-02/Week02Demo';

type Material = 'algodón' | 'dry-fit' | 'poliéster';
type Customization = 'printing' | 'embroidery' | 'sublimation';
type Size = 'S' | 'M' | 'L' | 'XL';
type OrderStatus = 'registered' | 'recommended' | 'assigned' | 'in_production' | 'completed';

interface Candidate {
  workshopId: string;
  displayName: string;
  rank: number;
  score: number;
  dimensions: { delivery: number; cost: number; reliability: number; quality: number; evidence: number };
  reasons: string[];
}

interface PortalOrder {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  draft: OrderDraft;
  recommendation: { candidates: Candidate[]; rejected: Array<{ displayName: string; reasons: string[] }> };
  assignment?: { workshopId: string; displayName: string; confirmedAt: string };
}

interface OrderDraft {
  product: 'polo';
  quantity: number;
  material: Material;
  color: string;
  sizes: Record<Size, number>;
  customization: Customization;
  designReference: string;
  requiredBy: string;
  deliveryDistrict: string;
  notes: string;
}

const initialDraft: OrderDraft = {
  product: 'polo',
  quantity: 100,
  material: 'algodón',
  color: 'Azul marino',
  sizes: { S: 20, M: 35, L: 30, XL: 15 },
  customization: 'printing',
  designReference: 'Logo institucional en el pecho',
  requiredBy: futureDate(18),
  deliveryDistrict: 'La Victoria',
  notes: '',
};

const statusLabels: Record<OrderStatus, string> = {
  registered: 'Registrado',
  recommended: 'Taller por confirmar',
  assigned: 'Taller asignado',
  in_production: 'En producción',
  completed: 'Terminado',
};

const customizationLabels: Record<Customization, string> = {
  printing: 'Estampado', embroidery: 'Bordado', sublimation: 'Sublimado',
};

function futureDate(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-PE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function percent(value: number): string { return `${Math.round(value * 100)} %`; }

export default function App() {
  if (window.location.pathname === '/demo/semana-3') return <QuotationDemo />;
  if (window.location.pathname === '/demo/semana-2') return <Week02Demo />;
  return <PortalApp />;
}

function PortalApp() {
  const [section, setSection] = useState<'new' | 'tracking'>('new');
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<OrderDraft>(initialDraft);
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [createdOrder, setCreatedOrder] = useState<PortalOrder>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function loadOrders() {
    const response = await fetch('/v1/orders');
    if (!response.ok) return;
    const payload = await response.json();
    setOrders(payload.orders);
  }

  useEffect(() => {
    void loadOrders();
    const socket = io(import.meta.env.DEV ? 'http://localhost:3100' : undefined);
    socket.on('order.updated', (order: PortalOrder) => {
      setOrders((current) => [order, ...current.filter((item) => item.id !== order.id)]);
      setCreatedOrder((current) => current?.id === order.id ? order : current);
    });
    return () => { socket.disconnect(); };
  }, []);

  function startNewOrder() {
    setDraft(initialDraft);
    setCreatedOrder(undefined);
    setMessage('');
    setStep(1);
    setSection('new');
  }

  return (
    <div className="min-h-screen bg-[var(--pa-paper)] text-[var(--pa-ink)]">
      <Header section={section} onNavigate={setSection} />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {section === 'new' && !createdOrder && (
          <OrderWizard
            draft={draft}
            setDraft={setDraft}
            step={step}
            setStep={setStep}
            busy={busy}
            message={message}
            onSubmit={async () => {
              setBusy(true);
              setMessage('');
              const response = await fetch('/v1/orders', {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
              });
              const payload = await response.json();
              setBusy(false);
              if (!response.ok) {
                setMessage(payload.message || payload.issues?.[0]?.message || 'Revisa los datos del pedido.');
                return;
              }
              setCreatedOrder(payload.order);
              setOrders((current) => [payload.order, ...current]);
            }}
          />
        )}
        {section === 'new' && createdOrder && (
          <Recommendation
            order={createdOrder}
            busy={busy}
            message={message}
            onConfirm={async (workshopId) => {
              setBusy(true);
              setMessage('');
              const response = await fetch(`/v1/orders/${createdOrder.id}/confirm`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workshopId }),
              });
              const payload = await response.json();
              setBusy(false);
              if (!response.ok) {
                setMessage('No se pudo confirmar el taller. Inténtalo nuevamente.');
                return;
              }
              setCreatedOrder(payload.order);
              setOrders((current) => [payload.order, ...current.filter((item) => item.id !== payload.order.id)]);
            }}
            onFinish={() => setSection('tracking')}
          />
        )}
        {section === 'tracking' && <Tracking orders={orders} onNew={startNewOrder} />}
      </main>
      <footer className="border-t border-black/10 bg-white px-4 py-5 text-center text-xs text-neutral-500">
        Piloto académico con datos simulados · Perú Activa 2026
      </footer>
    </div>
  );
}

function Header({ section, onNavigate }: { section: 'new' | 'tracking'; onNavigate: (value: 'new' | 'tracking') => void }) {
  return (
    <header className="border-b border-black/10 bg-white">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <button className="flex items-center gap-3 text-left" onClick={() => onNavigate('new')}>
          <span className="grid size-10 place-items-center bg-[var(--pa-red)] text-sm font-black text-white">PA</span>
          <span><strong className="block text-sm tracking-[.14em]">PERÚ ACTIVA</strong><small className="text-neutral-500">Portal de pedidos</small></span>
        </button>
        <nav className="flex items-center gap-1 rounded-full bg-neutral-100 p-1" aria-label="Secciones del portal">
          <button className={`nav-pill ${section === 'new' ? 'nav-pill-active' : ''}`} onClick={() => onNavigate('new')}>Nuevo pedido</button>
          <button className={`nav-pill ${section === 'tracking' ? 'nav-pill-active' : ''}`} onClick={() => onNavigate('tracking')}>Seguimiento</button>
        </nav>
      </div>
    </header>
  );
}

interface WizardProps {
  draft: OrderDraft;
  setDraft: (draft: OrderDraft) => void;
  step: number;
  setStep: (step: number) => void;
  busy: boolean;
  message: string;
  onSubmit: () => void;
}

function OrderWizard({ draft, setDraft, step, setStep, busy, message, onSubmit }: WizardProps) {
  const sizeTotal = useMemo(() => Object.values(draft.sizes).reduce((sum, value) => sum + value, 0), [draft.sizes]);
  const canContinue = step === 1 || (step === 2 && sizeTotal === draft.quantity) || step === 3;

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      <aside>
        <p className="eyebrow">Nuevo pedido</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Cuéntanos qué necesitas.</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">Avanza paso a paso. El código del pedido y la búsqueda de talleres se generan automáticamente.</p>
        <ol className="mt-7 space-y-3">
          {['Prenda y cantidad', 'Detalles de confección', 'Entrega', 'Revisión'].map((label, index) => (
            <li key={label} className={`step-label ${step === index + 1 ? 'step-label-active' : ''} ${step > index + 1 ? 'step-label-done' : ''}`}>
              <span>{step > index + 1 ? '✓' : index + 1}</span>{label}
            </li>
          ))}
        </ol>
        <div className="mt-7 border-l-2 border-[var(--pa-red)] bg-white p-4 text-xs leading-5 text-neutral-600">
          <strong className="block text-[var(--pa-ink)]">Entorno piloto</strong>
          Los talleres y pedidos utilizados en esta demostración son simulados.
        </div>
      </aside>

      <section className="spec-sheet">
        {step === 1 && <StepProduct draft={draft} setDraft={setDraft} />}
        {step === 2 && <StepSpecifications draft={draft} setDraft={setDraft} sizeTotal={sizeTotal} />}
        {step === 3 && <StepDelivery draft={draft} setDraft={setDraft} />}
        {step === 4 && <StepReview draft={draft} />}
        {message && <p className="mt-5 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p>}
        <div className="mt-8 flex items-center justify-between border-t border-black/10 pt-5">
          <button className="secondary-action" type="button" disabled={step === 1 || busy} onClick={() => setStep(step - 1)}>Atrás</button>
          {step < 4 ? (
            <button className="primary-action" type="button" disabled={!canContinue} onClick={() => setStep(step + 1)}>Continuar →</button>
          ) : (
            <button className="primary-action" type="button" disabled={busy} onClick={onSubmit}>{busy ? 'Buscando talleres…' : 'Registrar y buscar taller →'}</button>
          )}
        </div>
      </section>
    </div>
  );
}

function StepProduct({ draft, setDraft }: { draft: OrderDraft; setDraft: (value: OrderDraft) => void }) {
  return (
    <>
      <SheetHeading number="01" title="Prenda y cantidad" description="Por ahora, el piloto trabaja con polos personalizados." />
      <label className="mt-7 block">
        <span className="field-label">Prenda</span>
        <span className="mt-2 flex w-full items-center gap-4 border-2 border-[var(--pa-red)] bg-red-50 p-4 sm:w-72">
          <span className="grid h-14 w-16 place-items-center border border-dashed border-red-300 bg-white text-[10px] font-black tracking-widest text-[var(--pa-red)]">POLO</span>
          <span><strong className="block">Polo personalizado</strong><small className="text-neutral-500">Única prenda del piloto</small></span>
        </span>
      </label>
      <div className="mt-7">
        <label className="field-label" htmlFor="quantity">¿Cuántas unidades?</label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button className="quantity-button" onClick={() => setDraft({ ...draft, quantity: Math.max(20, draft.quantity - 10) })}>−</button>
          <input id="quantity" className="quantity-input" type="number" min="20" max="500" step="10" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} />
          <button className="quantity-button" onClick={() => setDraft({ ...draft, quantity: Math.min(500, draft.quantity + 10) })}>+</button>
          <span className="text-sm text-neutral-500">mínimo 20</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">{[50, 100, 150, 200].map((value) => <button key={value} className="quick-chip" onClick={() => setDraft({ ...draft, quantity: value })}>{value}</button>)}</div>
      </div>
    </>
  );
}

function StepSpecifications({ draft, setDraft, sizeTotal }: { draft: OrderDraft; setDraft: (value: OrderDraft) => void; sizeTotal: number }) {
  return (
    <>
      <SheetHeading number="02" title="Detalles de confección" description="Estos datos evitan preguntas y errores cuando el pedido llega al taller." />
      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <Field label="Material">
          <select value={draft.material} onChange={(event) => setDraft({ ...draft, material: event.target.value as Material })}>
            <option value="algodón">Algodón</option><option value="dry-fit">Dry fit</option><option value="poliéster">Poliéster</option>
          </select>
        </Field>
        <Field label="Color principal"><input value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></Field>
      </div>
      <fieldset className="mt-6">
        <legend className="field-label">Personalización</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.entries(customizationLabels) as Array<[Customization, string]>).map(([value, label]) => (
            <label key={value} className={`option-card ${draft.customization === value ? 'option-card-active' : ''}`}>
              <input className="sr-only" type="radio" checked={draft.customization === value} onChange={() => setDraft({ ...draft, customization: value })} />{label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Referencia del diseño" hint="Ejemplo: logo al pecho y nombre en la espalda">
        <input value={draft.designReference} onChange={(event) => setDraft({ ...draft, designReference: event.target.value })} />
      </Field>
      <fieldset className="mt-6">
        <legend className="flex items-end justify-between gap-3"><span className="field-label">Cantidad por talla</span><span className={`text-xs font-bold ${sizeTotal === draft.quantity ? 'text-emerald-700' : 'text-red-700'}`}>{sizeTotal} de {draft.quantity}</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(draft.sizes) as Size[]).map((size) => (
            <label key={size} className="size-field"><span>{size}</span><input type="number" min="0" value={draft.sizes[size]} onChange={(event) => setDraft({ ...draft, sizes: { ...draft.sizes, [size]: Number(event.target.value) } })} /></label>
          ))}
        </div>
        {sizeTotal !== draft.quantity && <p className="mt-2 text-xs text-red-700">La suma debe coincidir con las {draft.quantity} unidades del pedido.</p>}
      </fieldset>
    </>
  );
}

function StepDelivery({ draft, setDraft }: { draft: OrderDraft; setDraft: (value: OrderDraft) => void }) {
  return (
    <>
      <SheetHeading number="03" title="Entrega" description="La fecha y el distrito se usan para revisar si el taller puede cumplir." />
      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <Field label="Fecha requerida"><input type="date" min={futureDate(7)} value={draft.requiredBy} onChange={(event) => setDraft({ ...draft, requiredBy: event.target.value })} /></Field>
        <Field label="Distrito de entrega"><input value={draft.deliveryDistrict} onChange={(event) => setDraft({ ...draft, deliveryDistrict: event.target.value })} /></Field>
      </div>
      <Field label="Indicaciones adicionales" hint="Opcional">
        <textarea rows={5} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Empaque, horario u otra indicación importante" />
      </Field>
      <div className="mt-6 bg-neutral-100 p-4 text-xs leading-5 text-neutral-600"><strong className="text-neutral-900">Privacidad del piloto:</strong> no ingreses nombres, teléfonos ni direcciones reales. Esta demostración utiliza información simulada.</div>
    </>
  );
}

function StepReview({ draft }: { draft: OrderDraft }) {
  const rows = [
    ['Prenda', `${draft.quantity} polos de ${draft.material}`],
    ['Color', draft.color],
    ['Tallas', Object.entries(draft.sizes).map(([size, value]) => `${size}: ${value}`).join(' · ')],
    ['Personalización', customizationLabels[draft.customization]],
    ['Diseño', draft.designReference],
    ['Entrega', `${formatDate(draft.requiredBy)} · ${draft.deliveryDistrict}`],
  ];
  return (
    <>
      <SheetHeading number="04" title="Revisa tu pedido" description="Al registrarlo, el sistema buscará talleres disponibles automáticamente." />
      <dl className="mt-7 divide-y divide-black/10 border-y border-black/10">{rows.map(([label, value]) => <div key={label} className="grid gap-1 py-4 sm:grid-cols-[150px_1fr]"><dt className="text-xs font-bold uppercase tracking-wider text-neutral-500">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>
    </>
  );
}

function SheetHeading({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="flex gap-4 border-b border-black/10 pb-5"><span className="font-mono text-sm font-bold text-[var(--pa-red)]">{number}</span><div><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="mt-1 text-sm leading-6 text-neutral-600">{description}</p></div></div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="mt-6 block"><span className="field-label">{label}</span>{hint && <span className="ml-2 text-xs text-neutral-400">{hint}</span>}<span className="field-control mt-2 block">{children}</span></label>;
}

function Recommendation({ order, busy, message, onConfirm, onFinish }: { order: PortalOrder; busy: boolean; message: string; onConfirm: (id: string) => void; onFinish: () => void }) {
  const candidate = order.recommendation.candidates[0]!;
  if (order.assignment) {
    return <section className="mx-auto max-w-2xl py-12 text-center"><span className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-700 text-3xl text-white">✓</span><p className="eyebrow mt-6">Pedido registrado</p><h1 className="mt-3 text-4xl font-bold tracking-tight">Taller asignado correctamente</h1><p className="mx-auto mt-4 max-w-lg text-neutral-600">{order.assignment.displayName} fue confirmado para el pedido {order.id}. Ya puedes revisar su seguimiento.</p><button className="primary-action mt-7" onClick={onFinish}>Ver seguimiento →</button></section>;
  }
  return (
    <section className="mx-auto max-w-3xl">
      <p className="eyebrow">Pedido {order.id}</p><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Encontramos un taller compatible.</h1><p className="mt-3 text-neutral-600">El sistema filtró restricciones y ordenó las alternativas. Perú Activa confirma la asignación final.</p>
      <article className="mt-8 border border-black/10 bg-white p-6 shadow-xl shadow-black/5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5"><div><span className="inline-block bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">Mejor alternativa</span><h2 className="mt-3 text-3xl font-bold">{candidate.displayName}</h2><p className="mt-2 text-sm text-neutral-600">Puede atender {order.draft.quantity} polos para el {formatDate(order.draft.requiredBy)}.</p></div><div className="text-right"><strong className="block text-4xl text-emerald-700">{Math.round(candidate.score * 100)}</strong><span className="text-xs uppercase tracking-wider text-neutral-500">puntos de 100</span></div></div>
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric value={percent(candidate.dimensions.reliability)} label="Puntualidad" /><Metric value={percent(candidate.dimensions.quality)} label="Calidad" /><Metric value={percent(candidate.dimensions.cost)} label="Costo" /><Metric value={percent(candidate.dimensions.evidence)} label="Evidencia" /></div>
        <details className="mt-6 border-t border-black/10 pt-5"><summary className="cursor-pointer text-sm font-bold text-[var(--pa-red)]">Ver razones y alternativas descartadas</summary><ul className="mt-4 grid gap-2 text-sm text-neutral-600">{candidate.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul><p className="mt-4 text-xs text-neutral-500">{order.recommendation.candidates.length - 1} alternativa adicional · {order.recommendation.rejected.length} descartada por restricciones</p></details>
        {message && <p className="mt-5 bg-red-50 p-3 text-sm text-red-800">{message}</p>}
        <button className="primary-action mt-7 w-full" disabled={busy} onClick={() => onConfirm(candidate.workshopId)}>{busy ? 'Confirmando…' : `Confirmar ${candidate.displayName}`}</button>
      </article>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) { return <div className="bg-neutral-100 p-3"><strong className="block text-lg">{value}</strong><span className="text-xs text-neutral-500">{label}</span></div>; }

function Tracking({ orders, onNew }: { orders: PortalOrder[]; onNew: () => void }) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">Seguimiento</p><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Tus pedidos</h1><p className="mt-2 text-sm text-neutral-600">Los cambios aparecen automáticamente en esta pantalla.</p></div><button className="primary-action" onClick={onNew}>+ Nuevo pedido</button></div>
      {orders.length === 0 ? <div className="mt-10 border border-dashed border-black/20 bg-white p-12 text-center"><h2 className="text-xl font-bold">Aún no tienes pedidos</h2><p className="mt-2 text-sm text-neutral-500">Registra el primero para ver aquí su avance.</p></div> : <div className="mt-8 grid gap-4">{orders.map((order) => <OrderRow key={order.id} order={order} />)}</div>}
    </section>
  );
}

function OrderRow({ order }: { order: PortalOrder }) {
  const activeIndex = ['registered', 'recommended', 'assigned', 'in_production', 'completed'].indexOf(order.status);
  return (
    <article className="border border-black/10 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="font-mono text-xs font-bold text-[var(--pa-red)]">{order.id}</span><h2 className="mt-1 text-xl font-bold">{order.draft.quantity} polos · {order.draft.color}</h2><p className="mt-1 text-sm text-neutral-500">Entrega solicitada: {formatDate(order.draft.requiredBy)}</p></div><span className="status-chip">{statusLabels[order.status]}</span></div>
      <div className="mt-6 grid grid-cols-4 gap-1" aria-label={`Estado: ${statusLabels[order.status]}`}>{['Registrado', 'Asignado', 'Producción', 'Terminado'].map((label, index) => <div key={label}><div className={`h-1.5 ${index <= Math.max(0, activeIndex - 1) ? 'bg-[var(--pa-red)]' : 'bg-neutral-200'}`}></div><span className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</span></div>)}</div>
      {order.assignment && <p className="mt-5 border-l-2 border-emerald-600 pl-3 text-sm"><strong>{order.assignment.displayName}</strong> confirmado para la producción.</p>}
    </article>
  );
}
