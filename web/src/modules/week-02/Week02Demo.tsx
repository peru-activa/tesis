import { useEffect, useRef, useState } from 'react';

interface Workshop {
  id: string;
  displayName: string;
  products: string[];
  materials: string[];
  processes: string[];
  availableCapacity: number;
  estimatedLeadTimeDays: number;
}

interface DemoScenario {
  delivery: {
    week: number;
    title: string;
    thesisResults: string[];
    resultStatus: 'partial';
    algorithmStage: 'heuristic-baseline';
  };
  request: {
    evaluatedAt: string;
    order: {
      product: string;
      material: string;
      quantity: number;
      requiredProcesses: string[];
      requiredBy: string;
    };
    workshops: Workshop[];
    weights: Record<Dimension, number>;
  };
}

type Dimension = 'delivery' | 'cost' | 'reliability' | 'quality' | 'evidence';

interface Candidate {
  workshopId: string;
  displayName: string;
  rank: number;
  score: number;
  dimensions: Record<Dimension, number>;
  reasons: string[];
}

interface DemoResult {
  algorithmVersion: string;
  candidates: Candidate[];
  rejected: Array<{ workshopId: string; displayName: string; reasons: string[] }>;
}

const dimensionLabels: Record<Dimension, string> = {
  delivery: 'Plazo',
  cost: 'Costo',
  reliability: 'Puntualidad',
  quality: 'Calidad',
  evidence: 'Evidencia',
};

const processLabels: Record<string, string> = {
  design: 'Diseño',
  cutting: 'Corte',
  sewing: 'Costura',
  printing: 'Estampado',
  embroidery: 'Bordado',
  sublimation: 'Sublimado',
  finishing: 'Acabado',
};

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function percentage(value: number): string {
  return `${Math.round(value * 100)} %`;
}

export function Week02Demo() {
  const [scenario, setScenario] = useState<DemoScenario>();
  const [result, setResult] = useState<DemoResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const autoRunStarted = useRef(false);

  useEffect(() => {
    fetch('/v1/demos/week-02')
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar el escenario.');
        return response.json();
      })
      .then((payload) => setScenario(payload))
      .catch(() => setError('No se pudo cargar la demostración. Revisa que la API esté activa.'));
  }, []);

  async function runAssignment() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/v1/demos/week-02/run', { method: 'POST' });
      if (!response.ok) throw new Error('No se pudo ejecutar la asignación.');
      const payload = await response.json();
      setResult(payload.result);
    } catch {
      setError('No se pudo ejecutar la asignación. Revisa que la API esté activa.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const shouldAutoRun = new URLSearchParams(window.location.search).get('autorun') === '1';
    if (scenario && shouldAutoRun && !autoRunStarted.current) {
      autoRunStarted.current = true;
      void runAssignment();
    }
  }, [scenario]);

  if (!scenario) {
    return <main className="demo-shell grid min-h-screen place-items-center"><p className="demo-kicker">{error || 'Preparando escenario simulado…'}</p></main>;
  }

  const winner = result?.candidates[0];

  return (
    <div className="demo-shell min-h-screen text-[var(--demo-ink)]">
      <header className="demo-header">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="demo-mark">PA</span>
            <div><strong className="block text-sm">Perú Activa</strong><span className="text-xs text-slate-500">Demostración académica</span></div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-bold">
            <span className="demo-tag">Semana 2</span>
            <span className="demo-tag demo-tag-muted">R5 · R8 parcial</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <section className="demo-hero">
          <div>
            <p className="demo-kicker">Mesa de asignación</p>
            <h1>Un pedido. Tres talleres. <em>Una decisión explicable.</em></h1>
            <p className="demo-lead">Ejecuta el escenario y observa cómo el sistema descarta talleres incompatibles y ordena los que sí pueden cumplir.</p>
            <button className="demo-run" disabled={busy} onClick={() => void runAssignment()}>
              <span>{busy ? 'Evaluando talleres…' : result ? 'Ejecutar nuevamente' : 'Ejecutar asignación'}</span>
              <span aria-hidden="true">{busy ? '···' : '→'}</span>
            </button>
            {error && <p className="demo-error">{error}</p>}
          </div>

          <article className="demo-order-card">
            <span className="demo-card-label">Pedido simulado</span>
            <strong>{scenario.request.order.quantity} polos de {scenario.request.order.material}</strong>
            <dl>
              <div><dt>Procesos</dt><dd>{scenario.request.order.requiredProcesses.map((process) => processLabels[process] ?? process).join(' · ')}</dd></div>
              <div><dt>Fecha límite</dt><dd>{dateLabel(scenario.request.order.requiredBy)}</dd></div>
              <div><dt>Talleres evaluados</dt><dd>{scenario.request.workshops.length}</dd></div>
            </dl>
          </article>
        </section>

        <section className="demo-route" aria-label="Etapas de la asignación">
          <RouteStep number="1" label="Pedido recibido" value="1" active />
          <RouteStep number="2" label="Talleres candidatos" value={String(scenario.request.workshops.length)} active />
          <RouteStep number="3" label="Cumplen restricciones" value={result ? String(result.candidates.length) : '—'} active={Boolean(result)} />
          <RouteStep number="4" label="Primera alternativa" value={winner?.displayName ?? '—'} active={Boolean(winner)} />
        </section>

        {!result ? (
          <section className="mt-8">
            <div className="demo-section-heading"><div><p className="demo-kicker">Antes de ejecutar</p><h2>Talleres candidatos</h2></div><p>Los datos se cargan desde un escenario versionado; no están escritos en la pantalla.</p></div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {scenario.request.workshops.map((workshop) => <WorkshopPreview key={workshop.id} workshop={workshop} />)}
            </div>
          </section>
        ) : (
          <ResultView scenario={scenario} result={result} />
        )}

        <section className="demo-scope">
          <div><span className="demo-scope-icon">✓</span><div><strong>Qué demuestra</strong><p>Filtrado de restricciones, ranking reproducible, factores visibles y razones de descarte.</p></div></div>
          <div><span className="demo-scope-icon demo-scope-pending">→</span><div><strong>Qué queda pendiente</strong><p>Algoritmo genético final, datos históricos y métricas del piloto con usuarios reales.</p></div></div>
        </section>
      </main>
    </div>
  );
}

function RouteStep({ number, label, value, active }: { number: string; label: string; value: string; active: boolean }) {
  return <div className={`demo-route-step ${active ? 'demo-route-step-active' : ''}`}><span>{number}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function WorkshopPreview({ workshop }: { workshop: Workshop }) {
  return (
    <article className="demo-workshop-card">
      <div className="flex items-start justify-between gap-3"><h3>{workshop.displayName}</h3><span>{workshop.availableCapacity} u.</span></div>
      <p>Capacidad disponible</p>
      <div className="demo-capacity"><i style={{ width: `${Math.min(100, workshop.availableCapacity / 4)}%` }} /></div>
      <dl><div><dt>Plazo</dt><dd>{workshop.estimatedLeadTimeDays} días</dd></div><div><dt>Procesos</dt><dd>{workshop.processes.length}</dd></div></dl>
    </article>
  );
}

function ResultView({ scenario, result }: { scenario: DemoScenario; result: DemoResult }) {
  const winner = result.candidates[0]!;
  return (
    <section className="mt-9">
      <div className="demo-section-heading"><div><p className="demo-kicker">Resultado calculado</p><h2>{winner.displayName} queda primero</h2></div><p>El puntaje combina cinco dimensiones después de validar las restricciones obligatorias.</p></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.08fr_.92fr]">
        <article className="demo-winner">
          <div className="demo-winner-head flex flex-wrap items-start justify-between gap-4"><div><span className="demo-card-label">Taller recomendado</span><h3>{winner.displayName}</h3></div><div className="demo-score"><strong>{Math.round(winner.score * 100)}</strong><span>/ 100</span></div></div>
          <div className="mt-7 grid gap-4">
            {(Object.keys(dimensionLabels) as Dimension[]).map((dimension) => (
              <div className="demo-factor" key={dimension}>
                <div><span>{dimensionLabels[dimension]}</span><small>Peso {percentage(scenario.request.weights[dimension])}</small><strong>{percentage(winner.dimensions[dimension])}</strong></div>
                <div><i style={{ width: percentage(winner.dimensions[dimension]) }} /></div>
              </div>
            ))}
          </div>
        </article>

        <div className="grid gap-4">
          {result.candidates.map((candidate) => (
            <article className="demo-decision demo-decision-ok" key={candidate.workshopId}>
              <span className="demo-rank">#{candidate.rank}</span><div><strong>{candidate.displayName}</strong><p>Cumple todas las restricciones</p></div><b>{Math.round(candidate.score * 100)} pts</b>
            </article>
          ))}
          {result.rejected.map((workshop) => (
            <article className="demo-decision demo-decision-no" key={workshop.workshopId}>
              <span className="demo-rank">×</span><div><strong>{workshop.displayName}</strong><p>{workshop.reasons.join(' · ')}</p></div><b>Descartado</b>
            </article>
          ))}
          <div className="demo-method-note"><strong>Línea base heurística · versión {result.algorithmVersion}</strong><p>La misma entrada produce el mismo resultado. Esta etapa servirá para comparar posteriormente el algoritmo genético comprometido en la tesis.</p></div>
        </div>
      </div>
    </section>
  );
}
