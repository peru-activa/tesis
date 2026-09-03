import { useState } from 'react';

type FabricBuyer = 'peru_activa' | 'workshop';

type Scenario = {
  id: string;
  title: string;
  focus: string;
  draft: { product: string; quantity: number; material: string; requiredBy: string };
  fabricBuyer: FabricBuyer;
};

type Allocation = {
  workshopId: string;
  displayName: string;
  quantity: number;
  availableCapacity: number;
  effectiveLeadTimeDays: number;
  estimatedCost: number;
  assignedProcesses?: string[];
};

type WorkflowStep = {
  sequence: number;
  process: string;
  workshopId: string;
  displayName: string;
  inputState?: string;
  outputState?: string;
};

type Candidate = {
  candidateId: string;
  displayName: string;
  score: number;
  allocations: Allocation[];
  reasons: string[];
  dimensions: Record<'delivery' | 'cost' | 'reliability' | 'quality' | 'evidence', number>;
  workflowSteps?: WorkflowStep[];
};

type Rejected = { workshopId: string; displayName: string; reasons: string[] };

type AlgorithmResult = {
  candidates: Candidate[];
  rejected: Rejected[];
};

type ComparisonPayload = {
  datasetVersion: string;
  seed: number;
  scenario: Scenario;
  request: {
    order: {
      id: string;
      product: string;
      material: string;
      quantity: number;
      fabricBuyer: FabricBuyer;
      requiredProcesses: string[];
      requiredBy: string;
    };
    weights: Record<string, number>;
    workshopCount: number;
  };
  comparison: {
    baseline: {
      algorithm: 'deterministic-baseline';
      averageMilliseconds: number;
      repetitions: number;
      value: AlgorithmResult;
    };
    genetic: {
      algorithm: 'genetic';
      averageMilliseconds: number;
      repetitions: number;
      value: {
        algorithmVersion: string;
        seed: number;
        evaluations: number;
        parameters: {
          populationSize: number;
          generations: number;
          mutationRate: number;
          eliteCount: number;
          maximumWorkshops: number;
        };
        convergence: Array<{
          generation: number;
          bestScore: number;
          averageScore: number;
          feasibleIndividuals: number;
        }>;
        result: AlgorithmResult;
      };
    };
    summary: {
      baselineFeasible: boolean;
      geneticFeasible: boolean;
      scoreDifference: number | null;
      sameAllocation: boolean;
    };
  };
};

const dimensionLabels = {
  delivery: 'Entrega',
  cost: 'Costo',
  reliability: 'Puntualidad',
  quality: 'Calidad',
  evidence: 'Evidencia',
};

const processLabels: Record<string, string> = {
  fabric_sourcing: 'Abastecimiento de tela',
  design: 'Diseño',
  transfer_printing: 'Impresión en papel',
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

function percentage(value: number): string {
  return `${Math.round(value * 100)} %`;
}

function milliseconds(value: number): string {
  return value < 1 ? `${Math.round(value * 1000)} µs` : `${value.toFixed(2)} ms`;
}

function shortDate(value: string): string {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function downloadComparison(payload: ComparisonPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `r5-${payload.scenario.id}-${payload.datasetVersion}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function R5ComparisonView({
  scenarios,
  selectedScenario,
  selected,
  onScenarioChange,
}: {
  scenarios: Scenario[];
  selectedScenario: string;
  selected?: Scenario;
  onScenarioChange: (id: string) => void;
}) {
  const [comparison, setComparison] = useState<ComparisonPayload>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fabricBuyerOverrides, setFabricBuyerOverrides] = useState<
    Partial<Record<string, FabricBuyer>>
  >({});
  const fabricBuyer = fabricBuyerOverrides[selectedScenario] ?? selected?.fabricBuyer ?? 'workshop';

  async function runComparison() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/v1/demos/week-03/assignment-scenarios/${selectedScenario}/compare`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fabricBuyer }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error('comparison_failed');
      setComparison(payload);
    } catch {
      setComparison(undefined);
      setError('No se pudo ejecutar la comparación. Verifica que la API esté disponible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="r5-lab" aria-labelledby="r5-lab-title">
      <header className="r5-lab-header">
        <div>
          <p className="mc-kicker">R5 · COMPARACIÓN CONTROLADA</p>
          <h2 id="r5-lab-title">Una entrada. Dos métodos. Evidencia visible.</h2>
          <p>
            La línea base y el algoritmo genético reciben el mismo pedido, talleres, restricciones,
            pesos y semilla. Los tiempos son promedios observados en esta ejecución.
          </p>
        </div>
        <span className="r5-simulated-stamp">Datos simulados</span>
      </header>

      <div className="r5-control-grid">
        <aside className="r5-scenario-card">
          <label htmlFor="r5-scenario">Escenario versionado</label>
          <select
            id="r5-scenario"
            value={selectedScenario}
            onChange={(event) => {
              onScenarioChange(event.target.value);
              setComparison(undefined);
              setError('');
            }}
          >
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.title}
              </option>
            ))}
          </select>
          {selected ? <ScenarioSummary scenario={selected} /> : null}
          <label htmlFor="r5-fabric-buyer">¿Quién compra la tela?</label>
          <select
            id="r5-fabric-buyer"
            value={fabricBuyer}
            onChange={(event) => {
              const value = event.target.value as FabricBuyer;
              setFabricBuyerOverrides((current) => ({
                ...current,
                [selectedScenario]: value,
              }));
              setComparison(undefined);
              setError('');
            }}
          >
            <option value="workshop">Taller productor</option>
            <option value="peru_activa">Perú Activa</option>
          </select>
          <button disabled={busy || scenarios.length === 0} onClick={runComparison}>
            {busy ? 'Comparando métodos…' : 'Ejecutar comparación'}
          </button>
          <p className="r5-method-note">
            Se repite cada método para estimar su tiempo medio; el resultado conserva la semilla{' '}
            <b>{comparison?.seed ?? 'configurada'}</b>.
          </p>
        </aside>

        <div className="r5-results" aria-live="polite">
          {error ? <p className="r5-error">{error}</p> : null}
          {!comparison && !error ? <ComparisonEmpty /> : null}
          {comparison ? (
            <>
              <ComparisonVerdict
                payload={comparison}
                onExport={() => downloadComparison(comparison)}
              />
              <div className="r5-method-grid">
                <MethodCard
                  label="Línea base"
                  version="determinística 0.6.0"
                  runtime={comparison.comparison.baseline.averageMilliseconds}
                  repetitions={comparison.comparison.baseline.repetitions}
                  result={comparison.comparison.baseline.value}
                />
                <MethodCard
                  label="Algoritmo genético"
                  version={comparison.comparison.genetic.value.algorithmVersion}
                  runtime={comparison.comparison.genetic.averageMilliseconds}
                  repetitions={comparison.comparison.genetic.repetitions}
                  result={comparison.comparison.genetic.value.result}
                  accent
                />
              </div>
              <ConvergenceChart payload={comparison} />
              <MethodRegister payload={comparison} />
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ScenarioSummary({ scenario }: { scenario: Scenario }) {
  return (
    <div className="r5-scenario-summary">
      <p>{scenario.focus}</p>
      <dl>
        <div>
          <dt>Producto</dt>
          <dd>{scenario.draft.product}</dd>
        </div>
        <div>
          <dt>Cantidad</dt>
          <dd>{scenario.draft.quantity} un.</dd>
        </div>
        <div>
          <dt>Material</dt>
          <dd>{scenario.draft.material}</dd>
        </div>
        <div>
          <dt>Entrega</dt>
          <dd>{shortDate(scenario.draft.requiredBy)}</dd>
        </div>
      </dl>
    </div>
  );
}

function ComparisonEmpty() {
  return (
    <div className="r5-empty">
      <div className="r5-empty-track">
        <span>BASE</span>
        <i />
        <span>GA</span>
      </div>
      <h3>La comparación está lista para ejecutarse</h3>
      <p>Selecciona un escenario para obtener asignación, aptitud, tiempo y convergencia.</p>
    </div>
  );
}

function ComparisonVerdict({
  payload,
  onExport,
}: {
  payload: ComparisonPayload;
  onExport: () => void;
}) {
  const { summary } = payload.comparison;
  const feasible = summary.baselineFeasible && summary.geneticFeasible;
  return (
    <div className={`r5-verdict ${feasible ? 'is-feasible' : 'is-infeasible'}`}>
      <div>
        <span>{feasible ? 'COMPARACIÓN COMPLETADA' : 'RESTRICCIONES ACTIVAS'}</span>
        <strong>
          {feasible
            ? summary.sameAllocation
              ? 'Ambos métodos encontraron la misma asignación'
              : 'Los métodos encontraron asignaciones diferentes'
            : 'Ningún método encontró una asignación factible'}
        </strong>
        <small>
          Dataset {payload.datasetVersion} · semilla {payload.seed} ·{' '}
          {payload.request.workshopCount} talleres evaluados
        </small>
      </div>
      <button onClick={onExport}>Exportar evidencia JSON</button>
    </div>
  );
}

function MethodCard({
  label,
  version,
  runtime,
  repetitions,
  result,
  accent = false,
}: {
  label: string;
  version: string;
  runtime: number;
  repetitions: number;
  result: AlgorithmResult;
  accent?: boolean;
}) {
  const candidate = result.candidates[0];
  return (
    <article className={`r5-method-card ${accent ? 'is-genetic' : ''}`}>
      <header>
        <div>
          <span>{label}</span>
          <small>{version}</small>
        </div>
        <b>{candidate ? 'Factible' : 'Sin solución'}</b>
      </header>
      <div className="r5-method-metrics">
        <div>
          <span>Aptitud</span>
          <strong>{candidate ? percentage(candidate.score) : '—'}</strong>
        </div>
        <div>
          <span>Tiempo medio</span>
          <strong>{milliseconds(runtime)}</strong>
        </div>
        <div>
          <span>Repeticiones</span>
          <strong>{repetitions}</strong>
        </div>
      </div>
      {candidate ? (
        <CandidateEvidence candidate={candidate} />
      ) : (
        <RejectedEvidence rejected={result.rejected} />
      )}
    </article>
  );
}

function CandidateEvidence({ candidate }: { candidate: Candidate }) {
  return (
    <div className="r5-candidate-evidence">
      <div className="r5-assignment-heading">
        <span>Asignación propuesta</span>
        <b>{candidate.displayName}</b>
      </div>
      <div className="r5-allocation-track">
        {candidate.allocations.map((allocation) => (
          <div
            key={allocation.workshopId}
            style={{ flexGrow: allocation.quantity }}
            title={`${allocation.displayName}: ${allocation.quantity} unidades`}
          >
            <b>{allocation.displayName}</b>
            <strong>{allocation.quantity}</strong>
            <small>
              unidades · {allocation.effectiveLeadTimeDays} días
              {allocation.assignedProcesses?.length
                ? ` · ${allocation.assignedProcesses.map((item) => processLabels[item] || item).join(', ')}`
                : ''}
            </small>
          </div>
        ))}
      </div>
      {candidate.workflowSteps?.length ? (
        <ol className="r5-workflow-steps">
          {candidate.workflowSteps.map((step) => (
            <li key={`${step.sequence}-${step.workshopId}-${step.process}`}>
              <span>{String(step.sequence).padStart(2, '0')}</span>
              <div>
                <b>{processLabels[step.process] || step.process}</b>
                <small>{step.displayName}</small>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <dl className="r5-dimensions">
        {Object.entries(candidate.dimensions)
          .filter(([key]) => key !== 'cost')
          .map(([key, value]) => (
            <div key={key}>
              <dt>{dimensionLabels[key as keyof typeof dimensionLabels]}</dt>
              <dd>
                <i>
                  <span style={{ width: percentage(value) }} />
                </i>
                <b>{percentage(value)}</b>
              </dd>
            </div>
          ))}
      </dl>
      <details>
        <summary>Razones de la asignación</summary>
        <ul>
          {candidate.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function RejectedEvidence({ rejected }: { rejected: Rejected[] }) {
  return (
    <div className="r5-rejected-evidence">
      {rejected.map((item) => (
        <details key={item.workshopId}>
          <summary>{item.displayName}</summary>
          <ul>
            {item.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function ConvergenceChart({ payload }: { payload: ComparisonPayload }) {
  const points = payload.comparison.genetic.value.convergence;
  const width = 600;
  const height = 170;
  const padding = 18;
  const path = (key: 'bestScore' | 'averageScore') =>
    points
      .map((point, index) => {
        const x = padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2);
        const y = height - padding - point[key] * (height - padding * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  const genetic = payload.comparison.genetic.value;
  return (
    <section className="r5-convergence">
      <header>
        <div>
          <span>TRAZA DEL ALGORITMO GENÉTICO</span>
          <h3>Convergencia por generación</h3>
        </div>
        <dl>
          <div>
            <dt>Población</dt>
            <dd>{genetic.parameters.populationSize}</dd>
          </div>
          <div>
            <dt>Generaciones</dt>
            <dd>{genetic.parameters.generations}</dd>
          </div>
          <div>
            <dt>Mutación</dt>
            <dd>{percentage(genetic.parameters.mutationRate)}</dd>
          </div>
          <div>
            <dt>Evaluaciones</dt>
            <dd>{genetic.evaluations}</dd>
          </div>
        </dl>
      </header>
      <div className="r5-chart-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Mejor aptitud y aptitud promedio por generación"
        >
          <line x1="18" y1="18" x2="18" y2="152" className="r5-axis" />
          <line x1="18" y1="152" x2="582" y2="152" className="r5-axis" />
          <polyline points={path('averageScore')} className="r5-line-average" />
          <polyline points={path('bestScore')} className="r5-line-best" />
        </svg>
        <div className="r5-chart-legend">
          <span className="best">Mejor aptitud</span>
          <span className="average">Promedio de población</span>
        </div>
      </div>
    </section>
  );
}

function MethodRegister({ payload }: { payload: ComparisonPayload }) {
  return (
    <details className="r5-register">
      <summary>Ver entrada y parámetros reproducibles</summary>
      <div className="r5-register-grid">
        <div>
          <span>Pedido</span>
          <b>{payload.request.order.id}</b>
        </div>
        <div>
          <span>Compra de tela</span>
          <b>
            {payload.request.order.fabricBuyer === 'peru_activa'
              ? 'Perú Activa'
              : 'Taller productor'}
          </b>
        </div>
        <div>
          <span>Procesos obligatorios</span>
          <b>
            {payload.request.order.requiredProcesses
              .map((item) => processLabels[item] || item)
              .join(', ')}
          </b>
        </div>
        <div>
          <span>Pesos</span>
          <b>
            {Object.entries(payload.request.weights)
              .filter(([, value]) => value > 0)
              .map(
                ([key, value]) =>
                  `${dimensionLabels[key as keyof typeof dimensionLabels] || key} ${percentage(value)}`,
              )
              .join(' · ')}
          </b>
        </div>
        <div>
          <span>Límite de talleres</span>
          <b>{payload.comparison.genetic.value.parameters.maximumWorkshops}</b>
        </div>
      </div>
      <p>
        La exportación JSON conserva la entrada, ambos resultados, la traza completa y los tiempos
        observados.
      </p>
    </details>
  );
}
