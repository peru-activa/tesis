import { AssignedWorkSummary } from './AssignedWorkSummary';
import { processLabels } from './processLabels';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import { fetchAsPeruActiva, fetchAsWorkshop, readApiResponse } from '../../lib/actor-api';
import { R5ComparisonView } from './R5ComparisonView';
import './multichannel.css';
import './order-detail.css';

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
  fabricBuyer: 'peru_activa' | 'workshop';
};
type Workshop = {
  id: string;
  displayName: string;
  contactPhone?: string;
  products: string[];
  materials: string[];
  materialFamilies: Array<'cotton_knit' | 'sports_knit' | 'stretch_knit' | 'woven'>;
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
type CoordinationStatus = {
  orderId: string;
  workshopId: string;
  state: string;
  effects: Array<{ phase: string; state: string; provider_receipt_id: string | null }>;
  lastError: string | null;
};
export type Order = {
  previewOnly?: boolean;
  id: string;
  testOnly?: boolean;
  createdAt?: string;
  status: 'registered' | 'recommended' | 'assigned' | 'in_production' | 'completed';
  draft: Scenario['draft'] & { color: string; sizes: Record<string, number>; deliveryDistrict?: string };
  recommendation: { candidates: Candidate[]; rejected: Rejected[] };
  assignment?: {
    candidateId: string;
    workshopId: string;
    displayName: string;
    allocations: Array<{
      workshopId: string;
      displayName: string;
      quantity: number;
      assignedProcesses?: string[];
      status: 'assigned' | 'in_production' | 'completed';
    }>;
  };
  notification?: Notification;
  simulation?: { datasetVersion: string; scenarioId: string; seed: number };
  source?: { type: 'quotation'; quotationId: string; garmentIndex: number };
};
type IncomingQuotation = {
  previewOnly?: boolean;
  id: string;
  testOnly?: boolean;
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
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);

  const actorFetch = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) =>
      view === 'taller'
        ? workshopPhone ? fetchAsWorkshop(workshopPhone, input, init) : fetch(input, init)
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
    async function load() {
      try {
        const [catalog, inbox, quotationQueue, orderList] = await Promise.all([
          fetch('/v1/demos/week-03/assignment-scenarios').then(readApiResponse<{scenarios: Scenario[]; workshops: Workshop[]; datasetVersion: string; seed: number}>),
          actorFetch('/v1/workshop-notifications').then(readApiResponse<{notifications: Notification[]}>),
          view === 'peru-activa'
            ? actorFetch('/v1/quotation-requests').then(readApiResponse<{requests: IncomingQuotation[]}>)
            : Promise.resolve({ requests: [] }),
          actorFetch('/v1/orders').then(readApiResponse<{orders: Order[]}>),
        ]);
        if (!active) return;
        if (![catalog.scenarios, catalog.workshops, inbox.notifications, quotationQueue.requests, orderList.orders].every(Array.isArray)) {
          throw new Error('No pudimos cargar la bandeja. Inténtalo de nuevo.');
        }
        setScenarios(catalog.scenarios);
        setWorkshops(catalog.workshops);
        setDataset(catalog.datasetVersion);
        setSeed(catalog.seed);
        setNotifications(inbox.notifications);
        setQuotations(quotationQueue.requests);
        setOrders(orderList.orders);
        setOrder((current) => {
          const previous = current && orderList.orders.find((item) => item.id === current.id);
          return previous ?? (view === 'evidencia'
            ? orderList.orders[0]
            : undefined);
        });
        const firstOrder = orderList.orders[0];
        if (view === 'evidencia' && firstOrder?.simulation?.scenarioId) {
          setSelectedScenario(firstOrder.simulation.scenarioId);
        }
        setLoadError('');
      } catch (cause) {
        if (active) setLoadError(cause instanceof Error ? cause.message : 'No pudimos cargar la bandeja.');
      }
    }
    void load();
    const apiOrigin =
      import.meta.env.VITE_API_ORIGIN ||
      (import.meta.env.DEV ? 'http://localhost:3100' : undefined);
    const socket = io(apiOrigin);
    socket.on('orders.changed', () => void load());
    socket.on('quotations.changed', () => {
      if (view === 'peru-activa') void load();
    });
    return () => {
      active = false;
      socket.disconnect();
    };
  }, [actorFetch, view, reload]);

  const selected = scenarios.find((scenario) => scenario.id === selectedScenario);
  const activeNotification = order?.notification ?? notifications[0];

  async function updateWorkshopStatus(orderId: string, status: 'in_production' | 'completed') {
    if (!workshopPhone) return;
    setBusy(true);
    setError('');
    try {
      const payload = await readApiResponse<{order: Order}>(await actorFetch(`/v1/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      }));
      if (!payload.order) throw new Error('No pudimos comprobar el nuevo estado del pedido.');
      setOrders((current) => current.map((currentOrder) => currentOrder.id === payload.order.id ? payload.order : currentOrder));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el estado del pedido.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`quote-demo mc-shell ${view === 'peru-activa' ? 'pa-operations' : ''}`}>
      <PeruActivaHeader
        homeHref="/demo"
        right={
          <span className="mc-local-badge">
            <i />{' '}
            {view === 'taller' && workshopPhone
              ? `Taller · ${workshopPhone}`
              : 'Perú Activa'}
          </span>
        }
      />

      <main className="mc-main">
        {loadError && (
          <div role="alert" className="workshop-status-error">
            <p>{loadError}</p>
            <button type="button" className="mc-secondary" onClick={() => setReload((value) => value + 1)}>Reintentar</button>
          </div>
        )}
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
                  : 'R5 · COMPARACIÓN REPRODUCIBLE'}
            </p>
            <h1>
              {view === 'peru-activa'
                ? 'Pedidos por atender'
                : view === 'taller'
                  ? 'Trabajos asignados'
                  : 'Evidencia del algoritmo de asignación'}
            </h1>
            <p>
              {view === 'peru-activa'
                ? 'Aquí aparecen automáticamente las solicitudes enviadas desde el formulario.'
                : view === 'taller'
                  ? 'Aquí aparecen los pedidos que Perú Activa confirmó para el taller.'
                  : 'Línea base y algoritmo genético comparados con cuatro productores, cuatro proveedores de proceso y nueve escenarios simulados.'}
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
                <dd>Demostración técnica</dd>
              </div>
            </dl>
          )}
        </section>

        {view === 'peru-activa' && (
          <>
            <IncomingQueue quotations={quotations} orders={orders} />


          </>
        )}

        {!loadError && view === 'taller' && (
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
            <R5ComparisonView
              scenarios={scenarios}
              selectedScenario={selectedScenario}
              selected={selected}
              onScenarioChange={setSelectedScenario}
            />
          </>
        )}
      </main>
    </div>
  );
}


const receivedDate = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima',
});

export function IncomingQueue({
  quotations,
  orders,
}: {
  quotations: IncomingQuotation[];
  orders: Order[];
}) {
  const pending = quotations.filter((item) => item.status === 'pending_quote').length;
  type QueueRow = {
    id: string; createdAt?: string; garments: Array<{ product: string; quantity: number }>;
    requiredBy: string; location?: string; quotation?: IncomingQuotation; orders: Order[];
  };
  const covered = new Set<string>();
  const rows: QueueRow[] = quotations.map((quotation) => {
    const linked = orders.filter((order) => quotation.production?.orderIds.includes(order.id)
      || order.source?.quotationId === quotation.id);
    linked.forEach((order) => covered.add(order.id));
    return { id: quotation.id, createdAt: quotation.createdAt,
      garments: [quotation.request.garment, ...quotation.request.additionalGarments],
      requiredBy: quotation.request.delivery.requiredBy, location: quotation.request.delivery.location,
      quotation, orders: linked };
  });
  for (const order of orders) {
    if (covered.has(order.id)) continue;
    rows.push({ id: order.id, createdAt: order.createdAt, garments: [order.draft],
      requiredBy: order.draft.requiredBy, location: order.draft.deliveryDistrict, orders: [order] });
  }
  const timestamp = (row: QueueRow) => Date.parse(row.createdAt ?? '');
  rows.sort((a, b) => (timestamp(b) || 0) - (timestamp(a) || 0));
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const groups: Array<{ label: string; rows: QueueRow[] }> = [
    { label: 'Últimos 7 días', rows: [] },
    { label: 'Más de una semana', rows: [] },
    { label: 'Sin fecha de registro', rows: [] },
  ];
  for (const row of rows) {
    const date = timestamp(row);
    groups[!Number.isFinite(date) ? 2 : date < weekAgo ? 1 : 0]!.rows.push(row);
  }
  const states: Record<Order['status'], string> = {
    registered: 'Sin taller factible', recommended: 'Orden evaluada', assigned: 'Taller asignado',
    in_production: 'En producción', completed: 'Terminado',
  };
  return (
    <section className="mc-incoming">
      <header>
        <div>
          <span className="mc-live-dot" />
          <div><p className="mc-kicker">SOLICITUDES Y ÓRDENES</p><h2>Pedidos</h2></div>
        </div>
        <strong>{pending} pendiente{pending === 1 ? '' : 's'}</strong>
      </header>
      {rows.length === 0 ? (
        <p className="mc-incoming-empty">Cuando un cliente envíe el formulario, la solicitud aparecerá aquí automáticamente.</p>
      ) : (
        <div className="mc-incoming-list">
          {groups.filter((group) => group.rows.length > 0).map((group) => (
            <Fragment key={group.label}>
              <h3 className="mc-incoming-divider">{group.label} <span>{group.rows.length}</span></h3>
              {group.rows.map((row) => (
                <article key={row.id}>
                  <div className="mc-incoming-code">
                    <b>{row.id}</b>
                    {(row.quotation?.previewOnly || row.orders.some((order) => order.previewOnly)) && <small>DEMOSTRACIÓN · NO FABRICAR</small>}
                    <small>{Number.isFinite(timestamp(row))
                      ? <time dateTime={row.createdAt}>Recibido {receivedDate.format(timestamp(row))}</time>
                      : 'Fecha de ingreso no registrada'}</small>
                    {(row.quotation?.testOnly || row.orders.some((order) => order.testOnly)) && <small>Prueba</small>}
                  </div>
                  <div>
                    <strong>{row.garments.reduce((sum, garment) => sum + garment.quantity, 0)} prendas · {row.garments.map((item) => item.product).join(' + ')}</strong>
                    <small>Entrega {shortDate(row.requiredBy)}{row.location ? ` · ${row.location}` : ''}</small>
                  </div>
                  {row.quotation ? <QuotationState quotation={row.quotation} /> : <span className={`mc-quotation-state ${row.orders[0]!.status}`}>{states[row.orders[0]!.status]}</span>}
                  <a className="mc-open-quotation" href={`/peru-activa/pedidos/${row.quotation?.id || row.orders[0]!.source?.quotationId || row.id}`} target="_self">
                    {row.quotation?.status === 'pending_quote' ? 'Abrir y cotizar' : 'Abrir pedido'}
                  </a>
                </article>
              ))}
            </Fragment>
          ))}
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

export function CandidateList({
  order,
  busy,
  error,
  onConfirm,
}: {
  order: Order;
  busy: boolean;
  error: string;
  onConfirm: (id: string) => void;
}) {
  if (order.status === 'registered') {
    return (
      <div className="mc-no-plan" role="status">
        <span aria-hidden="true">!</span>
        <p className="mc-kicker">ASIGNACIÓN DETENIDA</p>
        <h3>No hay un plan factible</h3>
        {error && <p role="alert">{error}</p>}
        <p>
          Ningún taller registrado cumple a la vez la capacidad, la fecha, la tela y los procesos
          requeridos. Este pedido no puede asignarse hasta revisar esas condiciones.
        </p>
        {order.recommendation.rejected.length > 0 && (
          <details>
            <summary>Ver por qué se descartaron los talleres</summary>
            <ul>
              {order.recommendation.rejected.map((workshop) => (
                <li key={workshop.workshopId}>
                  <b>{workshop.displayName}</b>
                  <span>{workshop.reasons.join(' ')}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }
  if (order.status !== 'recommended')
    return <><AssignedWorkSummary order={order} />{error && <p className="mc-assignment-error" role="alert">{error}</p>}</>;

  return (
    <div className="mc-candidates">
      <div className="mc-result-note">
        <b>{order.id}</b>
        <span>
          Se encontraron {order.recommendation.candidates.length}{' '}
          {order.recommendation.candidates.length === 1 ? 'plan factible' : 'planes factibles'}
        </span>
      </div>
      {error && (
        <p className="mc-assignment-error" role="alert">
          {error}
        </p>
      )}
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
          {candidate.allocations.length === 1
            ? 'Confirmar y asignar al taller'
            : `Confirmar y asignar a ${candidate.allocations.length} talleres`}
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
          <span>09</span>
          <div>
            <h2>Talleres declarados</h2>
            <p>Tres productores y cuatro proveedores de proceso</p>
          </div>
        </div>
        <div className="mc-evidence-list">
          {workshops.map((workshop, index) => (
            <article key={workshop.id}>
              <b>{String.fromCharCode(65 + index)}</b>
              <div>
                <h3>{workshop.displayName}</h3>
                <p>
                  {workshop.products.join(', ')} ·{' '}
                  {workshop.materialFamilies.map(materialFamilyLabel).join(', ')}
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

function materialFamilyLabel(family: Workshop['materialFamilies'][number]) {
  return {
    cotton_knit: 'Algodón',
    sports_knit: 'Deportivo',
    stretch_knit: 'Licra',
    woven: 'Tela plana',
  }[family];
}
