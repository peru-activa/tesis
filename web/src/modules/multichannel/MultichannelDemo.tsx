import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import { fetchAsPeruActiva, fetchAsWorkshop } from '../../lib/actor-api';
import './multichannel.css';

export type MultichannelView = 'peru-activa' | 'taller' | 'evidencia';
type Candidate = {
  candidateId: string;
  workshopId: string;
  displayName: string;
  allocations: Array<{
    workshopId: string;
    displayName: string;
    quantity: number;
    availableCapacity: number;
    effectiveLeadTimeDays: number;
    estimatedCost: number;
  }>;
  rank: number;
  score: number;
  dimensions: Record<'delivery' | 'cost' | 'reliability' | 'quality' | 'evidence', number>;
  reasons: string[];
};
type Rejected = { workshopId: string; displayName: string; reasons: string[] };
type Scenario = {
  id: string;
  title: string;
  focus: string;
  draft: { product: string; quantity: number; material: string; requiredBy: string };
};
type Workshop = {
  id: string;
  displayName: string;
  contactPhone: string;
  products: string[];
  materials: string[];
  availableCapacity: number;
  estimatedLeadTimeDays: number;
  evidenceLevel: string;
};
type Notification = {
  id: string;
  publishedAt: string;
  content: {
    orderId: string;
    workshopId: string;
    workshopName: string;
    product: string;
    quantity: number;
    material: string;
    color: string;
    sizes: Record<string, number>;
    requiredProcesses: string[];
    designReference: string;
    requiredBy: string;
    deliveryDistrict: string;
  };
  channels: {
    web: { status: 'published' };
    whatsapp: { status: 'preview_only'; messageText: string };
  };
};
type Order = {
  id: string;
  status: 'registered' | 'recommended' | 'assigned' | 'in_production' | 'completed';
  draft: Scenario['draft'] & { color: string; sizes: Record<string, number> };
  recommendation: { candidates: Candidate[]; rejected: Rejected[] };
  assignment?: {
    candidateId: string;
    workshopId: string;
    displayName: string;
    allocations: Array<{
      workshopId: string;
      displayName: string;
      quantity: number;
      status: 'assigned' | 'in_production' | 'completed';
    }>;
  };
  notification?: Notification;
  simulation?: { datasetVersion: string; scenarioId: string; seed: number };
  source?: { type: 'quotation'; quotationId: string; garmentIndex: number };
};
type IncomingQuotation = {
  id: string;
  createdAt: string;
  status: 'pending_quote' | 'quoted' | 'accepted' | 'rejected';
  request: {
    garment: { product: string; quantity: number };
    additionalGarments: Array<{ product: string; quantity: number }>;
    delivery: { requiredBy: string; location: string };
  };
  production?: {
    status: 'recommended' | 'no_eligible_workshop' | 'requires_scope_decision';
    orderIds: string[];
    message: string;
  };
};

const processLabels: Record<string, string> = {
  fabric_sourcing: 'Abastecimiento de tela',
  design: 'Diseño',
  patternmaking: 'Patronaje',
  cutting: 'Corte',
  sewing: 'Costura',
  printing: 'Estampado',
  vinyl: 'Vinil',
  embroidery: 'Bordado',
  sublimation: 'Sublimación',
  notions: 'Avíos',
  ironing: 'Planchado',
  finishing: 'Acabado',
  quality_control: 'Control de calidad',
  delivery: 'Entrega',
};
const dimensionLabels = {
  delivery: 'Entrega',
  cost: 'Costo',
  reliability: 'Puntualidad',
  quality: 'Calidad',
  evidence: 'Evidencia',
};

function score(value: number) {
  return `${Math.round(value * 100)}%`;
}
function shortDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function MultichannelDemo({
  view,
  workshopPhone,
}: {
  view: MultichannelView;
  workshopPhone?: string;
}) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [selectedScenario, setSelectedScenario] = useState('balanced-polo');
  const [order, setOrder] = useState<Order>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [quotations, setQuotations] = useState<IncomingQuotation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dataset, setDataset] = useState('');
  const [seed, setSeed] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState<Rejected[]>([]);

  const actorFetch = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) =>
      view === 'taller' && workshopPhone
        ? fetchAsWorkshop(workshopPhone, input, init)
        : fetchAsPeruActiva(input, init),
    [view, workshopPhone],
  );

  async function refreshNotifications() {
    const response = await actorFetch('/v1/workshop-notifications');
    if (!response.ok) return;
    const payload = await response.json();
    setNotifications(payload.notifications);
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch('/v1/demos/week-03/assignment-scenarios').then((response) => response.json()),
      actorFetch('/v1/workshop-notifications').then((response) => response.json()),
      view === 'peru-activa'
        ? actorFetch('/v1/quotation-requests').then((response) => response.json())
        : Promise.resolve({ requests: [] }),
      actorFetch('/v1/orders').then((response) => response.json()),
    ]).then(([catalog, inbox, quotationQueue, orderList]) => {
      if (!active) return;
      setScenarios(catalog.scenarios);
      setWorkshops(catalog.workshops);
      setDataset(catalog.datasetVersion);
      setSeed(catalog.seed);
      setNotifications(inbox.notifications);
      setQuotations(quotationQueue.requests);
      setOrders(orderList.orders);
      const currentOrder =
        view === 'evidencia'
          ? orderList.orders[0]
          : orderList.orders.find((item: Order) => item.source?.type === 'quotation');
      setOrder(currentOrder);
      if (view === 'evidencia' && currentOrder?.simulation?.scenarioId) {
        setSelectedScenario(currentOrder.simulation.scenarioId);
      }
    });

    const apiOrigin =
      import.meta.env.VITE_API_ORIGIN ||
      (import.meta.env.DEV ? 'http://localhost:3100' : undefined);
    const socket = io(apiOrigin);
    socket.on('orders.changed', () => {
      void Promise.all([
        actorFetch('/v1/orders').then((response) => response.json()),
        actorFetch('/v1/workshop-notifications').then((response) => response.json()),
      ]).then(([orderList, inbox]) => {
        setOrders(orderList.orders || []);
        setNotifications(inbox.notifications || []);
        const currentOrder =
          view === 'evidencia'
            ? (orderList.orders || [])[0]
            : (orderList.orders || []).find((item: Order) => item.source?.type === 'quotation');
        setOrder(currentOrder);
        if (view === 'evidencia' && currentOrder?.simulation?.scenarioId) {
          setSelectedScenario(currentOrder.simulation.scenarioId);
        }
      });
    });
    socket.on('quotations.changed', () => {
      if (view !== 'peru-activa') return;
      void actorFetch('/v1/quotation-requests')
        .then((response) => response.json())
        .then((payload) => setQuotations(payload.requests || []));
    });
    return () => {
      active = false;
      socket.disconnect();
    };
  }, [actorFetch, view]);

  const selected = scenarios.find((scenario) => scenario.id === selectedScenario);
  const activeNotification = order?.notification ?? notifications[0];
  const stage = order ? (order.status === 'recommended' ? 3 : 5) : notifications.length > 0 ? 5 : 0;

  async function runScenario() {
    setBusy(true);
    setError('');
    setRejected([]);
    setOrder(undefined);
    const response = await actorFetch(
      `/v1/demos/week-03/assignment-scenarios/${selectedScenario}/run`,
      { method: 'POST' },
    );
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.message || 'No se pudo ejecutar el escenario.');
      setRejected(payload.result?.rejected || []);
      return;
    }
    setOrder(payload.order);
    setOrders((current) => [
      payload.order,
      ...current.filter((item) => item.id !== payload.order.id),
    ]);
  }

  async function confirm(candidateId: string) {
    if (!order) return;
    setBusy(true);
    setError('');
    const response = await actorFetch(`/v1/orders/${order.id}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError('No se pudo confirmar la asignación.');
      return;
    }
    setOrder(payload.order);
    setOrders((current) => [
      payload.order,
      ...current.filter((item) => item.id !== payload.order.id),
    ]);
    await refreshNotifications();
  }

  async function updateWorkshopStatus(orderId: string, status: 'in_production' | 'completed') {
    if (!workshopPhone) return;
    setBusy(true);
    setError('');
    const response = await actorFetch(`/v1/orders/${orderId}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError('No se pudo actualizar el estado del pedido.');
      return;
    }
    setOrders((current) =>
      current.map((currentOrder) =>
        currentOrder.id === payload.order.id ? payload.order : currentOrder,
      ),
    );
  }

  return (
    <div className="quote-demo mc-shell">
      <PeruActivaHeader
        homeHref="/demo"
        right={
          <span className="mc-local-badge">
            <i />{' '}
            {view === 'taller' && workshopPhone
              ? `Taller · ${workshopPhone}`
              : 'Perú Activa · acceso local'}
          </span>
        }
      />

      <main className="mc-main">
        <div className="mc-backbar">
          <a href={view === 'peru-activa' ? '/nueva-solicitud' : '/peru-activa'}>
            {view === 'peru-activa' ? '← Crear una solicitud' : '← Volver a pedidos'}
          </a>
        </div>
        <section className={`mc-intro ${view !== 'evidencia' ? 'mc-intro-simple' : ''}`}>
          <div>
            <p className="mc-kicker">
              {view === 'peru-activa'
                ? 'PERÚ ACTIVA'
                : view === 'taller'
                  ? 'VISTA DEL TALLER'
                  : 'R5 + R7 · DEMOSTRACIÓN PARCIAL'}
            </p>
            <h1>
              {view === 'peru-activa'
                ? 'Pedidos por atender'
                : view === 'taller'
                  ? 'Trabajos asignados'
                  : 'Escenarios reproducibles'}
            </h1>
            <p>
              {view === 'peru-activa'
                ? 'Aquí aparecen automáticamente las solicitudes enviadas desde el formulario.'
                : view === 'taller'
                  ? 'Aquí aparecen los pedidos que Perú Activa confirmó para el taller.'
                  : 'Cinco talleres y ocho casos simulados, versionados y sin atribuir resultados del piloto.'}
            </p>
          </div>
          {view === 'evidencia' && (
            <dl className="mc-dataset">
              <div>
                <dt>Dataset</dt>
                <dd>{dataset || 'cargando…'}</dd>
              </div>
              <div>
                <dt>Semilla</dt>
                <dd>{seed ?? '—'}</dd>
              </div>
              <div>
                <dt>Estado académico</dt>
                <dd>Parcial</dd>
              </div>
            </dl>
          )}
        </section>

        {view === 'evidencia' && <FlowThread stage={stage} />}

        {view === 'peru-activa' && (
          <>
            <IncomingQueue quotations={quotations} orders={orders} onOpenOrder={setOrder} />

            {order?.source?.type === 'quotation' && (
              <section className="mc-panel mc-result-panel mc-live-assignment" aria-live="polite">
                <div className="mc-panel-heading">
                  <span>✓</span>
                  <div>
                    <h2>Taller sugerido</h2>
                    <p>Revisa y confirma antes de enviar</p>
                  </div>
                </div>
                <CandidateList order={order} busy={busy} onConfirm={confirm} />
              </section>
            )}
          </>
        )}

        {view === 'taller' && (
          <WorkshopView
            notifications={notifications}
            orders={orders}
            active={activeNotification}
            busy={busy}
            error={error}
            onStatusChange={updateWorkshopStatus}
          />
        )}
        {view === 'evidencia' && (
          <>
            <EvidenceView scenarios={scenarios} workshops={workshops} />
            <AssignmentDemoTools
              scenarios={scenarios}
              selectedScenario={selectedScenario}
              selected={selected}
              order={order}
              error={error}
              rejected={rejected}
              busy={busy}
              onScenarioChange={setSelectedScenario}
              onRun={runScenario}
              onConfirm={confirm}
            />
          </>
        )}
      </main>
      <footer className="mc-footer">
        Prototipo académico · datos completamente simulados · el canal WhatsApp no realiza envíos
      </footer>
    </div>
  );
}

export function WorkshopAccessPage() {
  const [phone, setPhone] = useState(() => {
    const demoPhone = new URLSearchParams(window.location.search).get('telefono') || '';
    return /^9\d{8}$/.test(demoPhone)
      ? demoPhone
      : sessionStorage.getItem('pa-workshop-phone') || '';
  });
  const [draft, setDraft] = useState('');
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch('/v1/demos/week-03/assignment-scenarios')
      .then((response) => response.json())
      .then((payload) => setWorkshops(payload.workshops || []));
  }, []);

  if (phone) {
    return <MultichannelDemo view="taller" workshopPhone={phone} />;
  }

  async function enter() {
    if (!/^9\d{8}$/.test(draft)) {
      setError('Ingresa un número peruano de nueve dígitos que comience con 9.');
      return;
    }
    setBusy(true);
    setError('');
    const response = await fetchAsWorkshop(draft, '/v1/session');
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(payload.message || 'No encontramos este taller simulado.');
      return;
    }
    sessionStorage.setItem('pa-workshop-phone', draft);
    setPhone(draft);
  }

  return (
    <div className="quote-demo workshop-access-shell">
      <PeruActivaHeader homeHref="/demo" />
      <main className="workshop-access-main">
        <section className="workshop-access-card">
          <p className="quote-kicker">ACCESO DEL TALLER</p>
          <h1>Revisa tus trabajos</h1>
          <p>Ingresa el número registrado del taller.</p>
          <label htmlFor="workshop-phone">Número de celular</label>
          <div className="workshop-phone-field">
            <span>+51</span>
            <input
              id="workshop-phone"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={9}
              placeholder="900 000 001"
              value={draft}
              onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 9))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void enter();
              }}
            />
          </div>
          {error && <p className="workshop-access-error">{error}</p>}
          <button className="quote-primary" disabled={busy} onClick={() => void enter()}>
            {busy ? 'Ingresando…' : 'Ver mis pedidos'} <span>→</span>
          </button>
          <details className="workshop-demo-credentials">
            <summary>Números simulados para probar</summary>
            <ul>
              {workshops.map((workshop) => (
                <li key={workshop.id}>
                  <button onClick={() => setDraft(workshop.contactPhone)}>
                    {workshop.displayName} · {workshop.contactPhone}
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <small>
            Demostración local: el número identifica al taller, pero todavía no se verifica por
            WhatsApp o SMS.
          </small>
        </section>
      </main>
    </div>
  );
}

function IncomingQueue({
  quotations,
  orders,
  onOpenOrder,
}: {
  quotations: IncomingQuotation[];
  orders: Order[];
  onOpenOrder: (order: Order) => void;
}) {
  const pending = quotations.filter((item) => item.status === 'pending_quote').length;
  return (
    <section className="mc-incoming">
      <header>
        <div>
          <span className="mc-live-dot" />
          <div>
            <p className="mc-kicker">RECIBIDOS DESDE EL FORMULARIO</p>
            <h2>Pedidos nuevos</h2>
          </div>
        </div>
        <strong>
          {pending} pendiente{pending === 1 ? '' : 's'}
        </strong>
      </header>
      {quotations.length === 0 ? (
        <p className="mc-incoming-empty">
          Cuando un cliente envíe el formulario, la solicitud aparecerá aquí automáticamente.
        </p>
      ) : (
        <div className="mc-incoming-list">
          {quotations.slice(0, 6).map((quotation) => {
            const garments = [quotation.request.garment, ...quotation.request.additionalGarments];
            const units = garments.reduce((sum, garment) => sum + garment.quantity, 0);
            const linkedOrder = orders.find((item) =>
              quotation.production?.orderIds.includes(item.id),
            );
            return (
              <article key={quotation.id}>
                <div className="mc-incoming-code">
                  <b>{quotation.id}</b>
                  <small>
                    {new Date(quotation.createdAt).toLocaleTimeString('es-PE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                </div>
                <div>
                  <strong>
                    {units} prendas · {garments.map((item) => item.product).join(' + ')}
                  </strong>
                  <small>
                    Entrega {shortDate(quotation.request.delivery.requiredBy)} ·{' '}
                    {quotation.request.delivery.location}
                  </small>
                </div>
                <QuotationState quotation={quotation} />
                {quotation.status === 'pending_quote' || quotation.status === 'quoted' ? (
                  <a className="mc-open-quotation" href={`/peru-activa/pedidos/${quotation.id}`}>
                    {quotation.status === 'pending_quote' ? 'Abrir y cotizar' : 'Ver cotización'}
                  </a>
                ) : linkedOrder ? (
                  <button onClick={() => onOpenOrder(linkedOrder)}>Abrir {linkedOrder.id}</button>
                ) : (
                  <span className="mc-queue-placeholder">
                    {quotation.status === 'accepted' ? 'Aceptada' : '—'}
                  </span>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QuotationState({ quotation }: { quotation: IncomingQuotation }) {
  const labels = {
    pending_quote: 'Nueva',
    quoted: 'Cotizada',
    accepted: 'Aceptada',
    rejected: 'Rechazada',
  };
  const productionLabel =
    quotation.production?.status === 'recommended'
      ? 'Orden evaluada'
      : quotation.production?.status === 'no_eligible_workshop'
        ? 'Sin taller factible'
        : quotation.production?.status === 'requires_scope_decision'
          ? 'Definir varias prendas'
          : labels[quotation.status];
  return (
    <span className={`mc-quotation-state ${quotation.production?.status || quotation.status}`}>
      {productionLabel}
    </span>
  );
}

function FlowThread({ stage }: { stage: number }) {
  const labels = [
    'Cotización aceptada',
    'Orden creada',
    'Talleres filtrados',
    'Propuesta calculada',
    'Confirmación humana',
    'Canales publicados',
  ];
  return (
    <ol className="mc-thread" aria-label="Estado del flujo">
      {labels.map((label, index) => (
        <li key={label} className={index <= stage ? 'done' : ''}>
          <span>{index < stage ? '✓' : index + 1}</span>
          <b>{label}</b>
        </li>
      ))}
    </ol>
  );
}

function AssignmentDemoTools({
  scenarios,
  selectedScenario,
  selected,
  order,
  error,
  rejected,
  busy,
  onScenarioChange,
  onRun,
  onConfirm,
}: {
  scenarios: Scenario[];
  selectedScenario: string;
  selected?: Scenario;
  order?: Order;
  error: string;
  rejected: Rejected[];
  busy: boolean;
  onScenarioChange: (id: string) => void;
  onRun: () => void;
  onConfirm: (id: string) => void;
}) {
  return (
    <section className="mc-demo-tools mc-evidence-demo">
      <h2>Ejecutar un caso simulado</h2>
      <p className="mc-demo-explanation">
        Esta sección usa datos simulados y demuestra cómo se filtran y ordenan los talleres.
      </p>
      <div className="mc-workspace">
        <aside className="mc-panel mc-scenario-panel">
          <div className="mc-panel-heading">
            <div>
              <h2>Pedido de ejemplo</h2>
            </div>
          </div>
          <label className="mc-label" htmlFor="scenario">
            Elige un caso
          </label>
          <select
            id="scenario"
            value={selectedScenario}
            onChange={(event) => onScenarioChange(event.target.value)}
          >
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.title}
              </option>
            ))}
          </select>
          {selected && (
            <div className="mc-order-ticket">
              <p>{selected.focus}</p>
              <dl>
                <div>
                  <dt>Producto</dt>
                  <dd>{selected.draft.product}</dd>
                </div>
                <div>
                  <dt>Cantidad</dt>
                  <dd>{selected.draft.quantity} un.</dd>
                </div>
                <div>
                  <dt>Material</dt>
                  <dd>{selected.draft.material}</dd>
                </div>
                <div>
                  <dt>Fecha</dt>
                  <dd>{shortDate(selected.draft.requiredBy)}</dd>
                </div>
              </dl>
            </div>
          )}
          <button className="mc-primary" disabled={busy || scenarios.length === 0} onClick={onRun}>
            {busy ? 'Buscando taller…' : 'Buscar taller'}
          </button>
        </aside>

        <section className="mc-panel mc-result-panel" aria-live="polite">
          <div className="mc-panel-heading">
            <div>
              <h2>Resultado</h2>
            </div>
          </div>
          {(!order || order.source?.type === 'quotation') && !error && <EmptyResult />}
          {error && <RejectedResult message={error} rejected={rejected} />}
          {order && !order.source && (
            <CandidateList order={order} busy={busy} onConfirm={onConfirm} />
          )}
        </section>
      </div>
    </section>
  );
}

function EmptyResult() {
  return (
    <div className="mc-empty">
      <span>?</span>
      <h3>Elige un pedido de ejemplo</h3>
      <p>Luego presiona “Buscar taller” para ver la recomendación.</p>
    </div>
  );
}

function RejectedResult({ message, rejected }: { message: string; rejected: Rejected[] }) {
  return (
    <div className="mc-rejected">
      <strong>Sin asignación factible</strong>
      <p>{message}</p>
      <div className="mc-rejection-grid">
        {rejected.map((item) => (
          <article key={item.workshopId}>
            <b>{item.displayName}</b>
            <ul>
              {item.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

function CandidateList({
  order,
  busy,
  onConfirm,
}: {
  order: Order;
  busy: boolean;
  onConfirm: (id: string) => void;
}) {
  if (order.status !== 'recommended')
    return (
      <div className="mc-published">
        <span className="mc-seal">✓</span>
        <p className="mc-kicker">
          {order.status === 'completed'
            ? 'PEDIDO TERMINADO'
            : order.status === 'in_production'
              ? 'PEDIDO EN PRODUCCIÓN'
              : 'PUBLICADO EN AMBOS CANALES'}
        </p>
        <h3>{order.assignment?.displayName}</h3>
        <p>
          La bandeja web y la vista previa de WhatsApp ya muestran la misma orden <b>{order.id}</b>.
        </p>
        <p className="mc-handoff">Abre “Vista del taller” para comprobar el resultado.</p>
      </div>
    );
  return (
    <div className="mc-candidates">
      <div className="mc-result-note">
        <b>{order.id}</b>
        <span>
          Se encontraron {order.recommendation.candidates.length}{' '}
          {order.recommendation.candidates.length === 1 ? 'plan factible' : 'planes factibles'}
        </span>
      </div>
      {order.recommendation.candidates[0] && (
        <CandidateCard
          candidate={order.recommendation.candidates[0]}
          recommended
          busy={busy}
          onConfirm={onConfirm}
        />
      )}
      {order.recommendation.candidates.length > 1 && (
        <details className="mc-alternatives">
          <summary>Ver otros planes factibles</summary>
          {order.recommendation.candidates.slice(1).map((candidate) => (
            <CandidateCard
              key={candidate.candidateId}
              candidate={candidate}
              busy={busy}
              onConfirm={onConfirm}
            />
          ))}
        </details>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  recommended = false,
  busy,
  onConfirm,
}: {
  candidate: Candidate;
  recommended?: boolean;
  busy: boolean;
  onConfirm: (id: string) => void;
}) {
  return (
    <article className={`mc-candidate ${recommended ? 'recommended' : ''}`}>
      <div className="mc-rank">{candidate.rank}</div>
      <div className="mc-candidate-body">
        <div className="mc-candidate-title">
          <div>
            <h3>{candidate.displayName}</h3>
            {recommended && <span>Mejor opción</span>}
          </div>
          <strong>{score(candidate.score)} compatible</strong>
        </div>
        <details className="mc-score-detail">
          <summary>¿Por qué se recomienda?</summary>
          <ul className="mc-reasons">
            {candidate.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div className="mc-allocation-grid" aria-label="Distribución propuesta">
            {candidate.allocations.map((allocation) => (
              <div key={allocation.workshopId}>
                <b>{allocation.displayName}</b>
                <span>{allocation.quantity} unidades</span>
                <small>
                  {allocation.effectiveLeadTimeDays} días · capacidad disponible{' '}
                  {allocation.availableCapacity}
                </small>
              </div>
            ))}
          </div>
          <div className="mc-score-bars">
            {Object.entries(candidate.dimensions).map(([dimension, value]) => (
              <div key={dimension}>
                <label>
                  {dimensionLabels[dimension as keyof typeof dimensionLabels]} <b>{score(value)}</b>
                </label>
                <i>
                  <span style={{ width: score(value) }} />
                </i>
              </div>
            ))}
          </div>
        </details>
        <button
          className={recommended ? 'mc-primary' : 'mc-secondary'}
          disabled={busy}
          onClick={() => onConfirm(candidate.candidateId)}
        >
          Confirmar este plan
        </button>
      </div>
    </article>
  );
}

function WorkshopView({
  notifications,
  orders,
  active,
  busy,
  error,
  onStatusChange,
}: {
  notifications: Notification[];
  orders: Order[];
  active?: Notification;
  busy: boolean;
  error: string;
  onStatusChange: (orderId: string, status: 'in_production' | 'completed') => void;
}) {
  const visible = useMemo(
    () =>
      active
        ? notifications.filter((item) => item.content.workshopId === active.content.workshopId)
        : notifications,
    [active, notifications],
  );
  return (
    <div className="mc-channel-grid">
      <section className="mc-panel mc-inbox">
        <div className="mc-panel-heading">
          <span>WEB</span>
          <div>
            <h2>Órdenes asignadas</h2>
            <p>{active?.content.workshopName || 'Todos los talleres simulados'}</p>
          </div>
          <em>{visible.length}</em>
        </div>
        {visible.length === 0 && (
          <div className="mc-empty compact">
            <h3>La bandeja está vacía</h3>
            <p>Confirma primero un taller desde la mesa de Perú Activa.</p>
          </div>
        )}
        {visible.map((notification) => (
          <WorkshopOrder
            key={notification.id}
            notification={notification}
            order={orders.find((order) => order.id === notification.content.orderId)}
            workshopId={notification.content.workshopId}
            busy={busy}
            onStatusChange={onStatusChange}
          />
        ))}
        {error && <p className="workshop-status-error">{error}</p>}
      </section>
      <section className="mc-phone-column">
        <p className="mc-kicker">MISMO CONTENIDO · SEGUNDO CANAL</p>
        <h2>Vista previa de WhatsApp</h2>
        <p>
          Este bloque consume la notificación canónica. En producción, el adaptador de Meta
          convertiría el mismo contenido a una plantilla aprobada.
        </p>
        <div className="mc-phone">
          <div className="mc-phone-top">
            <span>‹</span>
            <i>TS</i>
            <div>
              <b>{active?.content.workshopName || 'Taller proveedor'}</b>
              <small>vista previa local</small>
            </div>
          </div>
          <div className="mc-chat">
            {active ? (
              <div className="mc-bubble">
                <pre>{active.channels.whatsapp.messageText}</pre>
                <small>09:42&nbsp; ✓✓</small>
              </div>
            ) : (
              <p className="mc-chat-empty">Aún no existe un mensaje publicado.</p>
            )}
          </div>
          <div className="mc-phone-warning">No enviado · integración Meta pendiente</div>
        </div>
      </section>
    </div>
  );
}

function WorkshopOrder({
  notification,
  order,
  workshopId,
  busy,
  onStatusChange,
}: {
  notification: Notification;
  order?: Order;
  workshopId: string;
  busy: boolean;
  onStatusChange: (orderId: string, status: 'in_production' | 'completed') => void;
}) {
  const content = notification.content;
  return (
    <article className="mc-workshop-order">
      <header>
        <div>
          <p className="mc-kicker">NUEVA ORDEN ASIGNADA</p>
          <h3>{content.orderId}</h3>
        </div>
        <span>
          {workshopStatusLabel(
            order?.assignment?.allocations.find((item) => item.workshopId === workshopId)?.status,
          )}
        </span>
      </header>
      <div className="mc-order-hero">
        <strong>{content.quantity}</strong>
        <span>
          unidades
          <br />
          {content.product}
        </span>
        <b>{shortDate(content.requiredBy)}</b>
      </div>
      <dl>
        <div>
          <dt>Material / color</dt>
          <dd>
            {content.material} · {content.color}
          </dd>
        </div>
        <div>
          <dt>Distribución</dt>
          <dd>
            {Object.entries(content.sizes)
              .map(([size, units]) => `${size} ${units}`)
              .join(' · ')}
          </dd>
        </div>
        <div>
          <dt>Procesos</dt>
          <dd>
            {content.requiredProcesses.map((item) => processLabels[item] || item).join(' → ')}
          </dd>
        </div>
        <div>
          <dt>Diseño</dt>
          <dd>{content.designReference}</dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd>{content.deliveryDistrict}</dd>
        </div>
      </dl>
      {order?.assignment?.allocations.find((item) => item.workshopId === workshopId)?.status ===
        'assigned' && (
        <button
          className="mc-primary workshop-status-action"
          disabled={busy}
          onClick={() => onStatusChange(order.id, 'in_production')}
        >
          Empezar producción
        </button>
      )}
      {order?.assignment?.allocations.find((item) => item.workshopId === workshopId)?.status ===
        'in_production' && (
        <button
          className="mc-primary workshop-status-action"
          disabled={busy}
          onClick={() => onStatusChange(order.id, 'completed')}
        >
          Marcar como terminado
        </button>
      )}
    </article>
  );
}

function workshopStatusLabel(status?: 'assigned' | 'in_production' | 'completed') {
  if (status === 'in_production') return 'En producción';
  if (status === 'completed') return 'Terminado';
  return 'Nuevo';
}

function EvidenceView({ scenarios, workshops }: { scenarios: Scenario[]; workshops: Workshop[] }) {
  return (
    <div className="mc-evidence-grid">
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <span>05</span>
          <div>
            <h2>Talleres simulados</h2>
            <p>Capacidad y especialización declaradas</p>
          </div>
        </div>
        <div className="mc-evidence-list">
          {workshops.map((workshop, index) => (
            <article key={workshop.id}>
              <b>{String.fromCharCode(65 + index)}</b>
              <div>
                <h3>{workshop.displayName}</h3>
                <p>
                  {workshop.products.join(', ')} · {workshop.materials.join(', ')}
                </p>
              </div>
              <dl>
                <dt>Capacidad</dt>
                <dd>{workshop.availableCapacity} un.</dd>
                <dt>Plazo base</dt>
                <dd>{workshop.estimatedLeadTimeDays} días</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>
      <section className="mc-panel">
        <div className="mc-panel-heading">
          <span>08</span>
          <div>
            <h2>Escenarios versionados</h2>
            <p>Cobertura de casos factibles y no factibles</p>
          </div>
        </div>
        <ol className="mc-scenario-list">
          {scenarios.map((scenario, index) => (
            <li key={scenario.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <b>{scenario.title}</b>
                <p>{scenario.focus}</p>
              </div>
            </li>
          ))}
        </ol>
        <aside className="mc-limit">
          <b>Lo que esta pantalla no demuestra</b>
          <p>
            No valida los IOV con talleres reales, no compara todavía con el algoritmo genético y no
            prueba envío por WhatsApp.
          </p>
        </aside>
      </section>
    </div>
  );
}
