import { createHash, randomUUID } from 'node:crypto';
import type { OrderStore } from '../data/order-store.js';
import type { WorkshopStore } from '../data/workshop-store.js';
import type { QuotationStore } from '../infrastructure/quotation-store.js';
import type { PortalOrder } from '../domain/orders.js';
import { withoutRedundantSplits, WORKSHOP_RESPONSE_WINDOW_MINUTES, type AssignmentAutomation } from '../domain/assignment-plans.js';
import { workshopsForScope } from '../domain/workshop-scope.js';
import { requireOperationalRecord } from '../domain/preview-scope.js';
import { workshopAvailabilityReference, type ProductionWhatsApp } from '../infrastructure/production-whatsapp.js';
import { availabilityTargets } from './workshop-availability.js';
import { AssignmentFlowError, AssignmentDemoService } from './assignment-demo-service.js';

export class AssignmentAutomationService {
  private readonly owner = randomUUID();
  private busy = false;
  constructor(
    private readonly orders: OrderStore,
    private readonly workshops: WorkshopStore,
    private readonly quotations: QuotationStore,
    private readonly channel: ProductionWhatsApp,
    private readonly assignments: AssignmentDemoService,
    private readonly onUpdated?: (order: PortalOrder) => void,
    private readonly now = () => new Date().toISOString(),
  ) {}

  private async candidates(order: PortalOrder) {
    const workshops = workshopsForScope(await this.workshops.list(), order);
    return withoutRedundantSplits(order.recommendation.candidates.filter((candidate) =>
      candidate.allocations.every((allocation) => {
        const workshop = workshops.find((item) => item.id === allocation.workshopId);
        const units = allocation.assignedProcesses?.every((process) => process === 'patternmaking') ? 1 : allocation.quantity;
        return workshop && units >= workshop.minimumUnits;
      }),
    ));
  }

  async view(orderId: string) {
    const order = await this.orders.get(orderId);
    if (!order) throw new Error('No se encontró el pedido.');
    const candidates = await this.candidates(order);
    const candidate = order.automation
      ? order.recommendation.candidates.find((item) => item.candidateId === order.automation!.candidateId)
      : candidates[0];
    const targets = availabilityTargets(order, await this.workshops.list()).filter((target) =>
      candidate?.allocations.some((allocation) => allocation.workshopId === target.workshop.id),
    );
    const availability = order.previewOnly ? [] : await Promise.all(targets.map(async ({ workshop }) => {
      const identity = { workshopId: workshop.id, displayName: workshop.displayName, phone: workshop.contactPhone };
      if (!workshop.contactPhone) return { ...identity, state: 'missing_phone', lastError: 'Falta registrar el teléfono.' };
      try {
        const status = await this.channel.status(workshopAvailabilityReference(order, workshop.id), workshop.id);
        return { ...identity, ...(status ?? { state: 'not_contacted', lastError: null }) };
      } catch { return { ...identity, state: 'send_failed', lastError: 'No se pudo comprobar la respuesta.' }; }
    }));
    return { order, responseWindowMinutes: WORKSHOP_RESPONSE_WINDOW_MINUTES, automation: order.automation ?? null, candidate, alternatives: candidates.filter((item) => item.candidateId !== candidate?.candidateId), availability };
  }

  async start(orderId: string, authorizedBy: string, expectedCandidateId?: string) {
    const order = await this.orders.get(orderId);
    if (!order) throw new Error('No se encontró el pedido.');
    requireOperationalRecord(order);
    if (order.automation) return;
    if (order.assignment || order.status !== 'recommended') throw new Error('Este pedido no está pendiente de asignación.');
    const candidates = await this.candidates(order);
    if (!candidates.length) throw new Error('No hay un plan compatible. Actualiza la propuesta.');
    if (expectedCandidateId && expectedCandidateId !== candidates[0]!.candidateId) throw new Error('La propuesta cambió. Revisa el plan antes de iniciar.');
    const next: AssignmentAutomation = {
      revision: 1, phase: 'running', authorizedAt: this.now(), authorizedBy,
      candidateIds: candidates.map((item) => item.candidateId), candidateId: candidates[0]!.candidateId,
      attemptedWorkshopIds: [], notifiedWorkshopIds: [], declinedWorkshopIds: [], rejections: [],
      expiredWorkshopIds: [], expirations: [], responseWindowMinutes: WORKSHOP_RESPONSE_WINDOW_MINUTES,
    };
    const updated = await this.orders.updateAutomation(orderId, 0, next);
    if (updated) this.onUpdated?.(updated);
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const order of await this.orders.list()) {
        if (!order.previewOnly && order.automation?.phase === 'running') await this.step(order);
      }
    } finally { this.busy = false; }
  }

  async retryExpired(orderId: string, authorizedBy: string, requestId: string) {
    if (!authorizedBy.trim() || !requestId.trim()) throw new Error('La reconsulta requiere autorización e identificador.');
    const order = await this.orders.get(orderId);
    if (!order) throw new Error('No se encontró el pedido.');
    requireOperationalRecord(order);
    const previous = order.automation;
    if (previous?.retryRequestId === requestId || previous?.priorRuns?.some((run) => run.retryRequestId === requestId)) return;
    if (!previous || order.assignment || !['exhausted', 'paused'].includes(previous.phase)
      || (previous.lease && Date.parse(previous.lease.expiresAt) > Date.parse(this.now()))) {
      throw new Error('Solo se pueden retomar consultas detenidas sin asignación.');
    }
    const candidates = (await this.candidates(order)).filter((candidate) => previous.candidateIds.includes(candidate.candidateId));
    const ids = [...new Set(candidates.flatMap((item) => item.allocations.map((allocation) => allocation.workshopId)))];
    const statuses = await Promise.all(ids.map(async (id) => ({
      id, status: await this.channel.status(workshopAvailabilityReference(order, id), id),
    })));
    const retryIds = statuses.filter(({ id, status }) => previous.expiredWorkshopIds?.includes(id)
      && status?.state === 'capacity_expired' && !status.lastError).map(({ id }) => id);
    if (!retryIds.length) throw new Error('No hay consultas vencidas que puedan retomarse.');
    const confirmed = statuses.filter(({ status }) => status?.state === 'capacity_yes').map(({ id }) => id);
    const declined = [...new Set([...previous.declinedWorkshopIds,
      ...statuses.filter(({ status }) => status?.state === 'capacity_no').map(({ id }) => id)])];
    const expired = (previous.expiredWorkshopIds ?? []).filter((id) => !retryIds.includes(id));
    const eligible = candidates.filter((candidate) =>
      !candidate.allocations.some((allocation) => [...declined, ...expired].includes(allocation.workshopId))
      && confirmed.every((id) => candidate.allocations.some((allocation) => allocation.workshopId === id)));
    if (!eligible.length) throw new Error('No hay una alternativa que conserve las confirmaciones y negativas.');
    const reference = `DISP-R-${createHash('sha256').update(`${orderId}\n${requestId}`).digest('hex').slice(0, 32)}`;
    const { priorRuns = [], ...snapshot } = previous;
    const next: AssignmentAutomation = {
      revision: previous.revision + 1, phase: 'running', authorizedAt: this.now(), authorizedBy,
      candidateIds: eligible.map((candidate) => candidate.candidateId), candidateId: eligible[0]!.candidateId,
      attemptedWorkshopIds: previous.attemptedWorkshopIds.filter((id) => !retryIds.includes(id)),
      notifiedWorkshopIds: previous.notifiedWorkshopIds, declinedWorkshopIds: declined,
      rejections: previous.rejections, expiredWorkshopIds: expired, expirations: [],
      responseWindowMinutes: WORKSHOP_RESPONSE_WINDOW_MINUTES,
      availabilityReferences: { ...previous.availabilityReferences,
        ...Object.fromEntries(retryIds.map((id) => [id, reference])) },
      retryRequestId: requestId, priorRuns: [...priorRuns, snapshot],
    };
    const updated = await this.orders.updateAutomation(orderId, previous.revision, next);
    if (!updated) throw new Error('El pedido cambió durante la reconsulta. Revisa su estado.');
    this.onUpdated?.(updated);
  }

  private async step(initial: PortalOrder) {
    const previous = initial.automation!;
    if (previous.lease && Date.parse(previous.lease.expiresAt) > Date.parse(this.now())) return;
    let order = await this.orders.updateAutomation(initial.id, previous.revision, {
      ...previous, revision: previous.revision + 1,
      lease: { owner: this.owner, expiresAt: new Date(Date.parse(this.now()) + 120_000).toISOString() },
    });
    if (!order) return;
    const save = async (changes: Partial<AssignmentAutomation>, visible = true) => {
      const current = order!.automation!;
      const updated = await this.orders.updateAutomation(order!.id, current.revision, { ...current, ...changes, revision: current.revision + 1, lease: { owner: this.owner, expiresAt: new Date(Date.parse(this.now()) + 120_000).toISOString() } });
      if (!updated) throw new Error('La ejecución cambió. Revisa el estado del pedido.');
      order = updated;
      if (visible) this.onUpdated?.(updated);
    };
    try {
      // Negative replies and acknowledged expirations advance the authorized list.
      while (!order.assignment) {
        let view = await this.view(order.id);
        const candidate = view.candidate;
        if (!candidate) throw new Error('El plan autorizado ya no está disponible.');
        // Only a provider-acknowledged consultation can expire. Errors and
        // ambiguous sends stay paused instead of being treated as a refusal.
        const elapsed = view.availability.filter((item) => item.state === 'capacity_pending' && !item.lastError && 'responseDeadline' in item && item.responseDeadline && Date.parse(String(item.responseDeadline)) <= Date.parse(this.now()));
        if (elapsed.length) {
          if (!this.channel.expire) throw new Error('El canal aún no permite cerrar consultas vencidas.');
          await Promise.all(elapsed.map((item) => this.channel.expire!(workshopAvailabilityReference(order!, item.workshopId), item.workshopId)));
          view = await this.view(order.id);
        }
        const declined = view.availability.filter((item) => item.state === 'capacity_no').map((item) => item.workshopId);
        const expired = view.availability.filter((item) => item.state === 'capacity_expired').map((item) => item.workshopId);
        if (declined.length || expired.length) {
          const rejectedIds = [...new Set([...order.automation!.declinedWorkshopIds, ...declined])];
          const expiredIds = [...new Set([...(order.automation!.expiredWorkshopIds ?? []), ...expired])];
          const excluded = [...rejectedIds, ...expiredIds];
          const confirmedIds = view.availability.filter((item) => item.state === 'capacity_yes').map((item) => item.workshopId);
          const next = order.automation!.candidateIds.map((id) => order!.recommendation.candidates.find((item) => item.candidateId === id))
            .find((item) => item && !item.allocations.some((allocation) => excluded.includes(allocation.workshopId)) && confirmedIds.every((id) => item.allocations.some((allocation) => allocation.workshopId === id)));
          await save({
            declinedWorkshopIds: rejectedIds, expiredWorkshopIds: expiredIds, responseWindowMinutes: WORKSHOP_RESPONSE_WINDOW_MINUTES,
            rejections: declined.length ? [...order.automation!.rejections, { candidateId: candidate.candidateId, workshopIds: declined, at: this.now() }] : order.automation!.rejections,
            expirations: expired.length ? [...(order.automation!.expirations ?? []), { candidateId: candidate.candidateId, workshopIds: expired, at: this.now() }] : (order.automation!.expirations ?? []),
            ...(next ? { candidateId: next.candidateId } : { phase: 'exhausted', message: 'No quedan alternativas que conserven a los talleres confirmados. Revisa una nueva propuesta.' }),
          });
          if (!next) return;
          continue;
        }
        if (view.availability.length !== candidate.allocations.length || view.availability.some((item) => item.state === 'missing_phone' || item.state === 'send_failed' || item.lastError)) {
          throw new Error('No se pudo comprobar la consulta. Revisa el contacto o el envío; no se consultarán alternativas por este error.');
        }
        const fresh = view.availability.filter((item) => item.state === 'not_contacted');
        if (fresh.length) {
          if (fresh.some((item) => order!.automation!.attemptedWorkshopIds.includes(item.workshopId))) {
            throw new Error('Hay un envío sin resultado confirmado. Requiere conciliación antes de repetirlo.');
          }
          const ids = fresh.map((item) => item.workshopId);
          await save({ attemptedWorkshopIds: [...order.automation!.attemptedWorkshopIds, ...ids] });
          const targets = availabilityTargets(order, await this.workshops.list()).filter((target) => ids.includes(target.workshop.id));
          const sent = await Promise.allSettled(targets.map(({ workshop, notification }) => this.channel.consult!(order!, notification, `51${workshop.contactPhone}`)));
          if (sent.some((result) => result.status === 'rejected')) throw new Error('No se pudo confirmar un envío. Revisa su estado; no se repetirá automáticamente.');
          return;
        }
        if (!view.availability.every((item) => item.state === 'capacity_yes')) return;
        order = await this.assignments.confirm(order.id, candidate.candidateId);
        this.onUpdated?.(order);
      }
      const quotation = order.source ? await this.quotations.get(order.source.quotationId) : undefined;
      for (const notification of order.notifications ?? []) {
        const id = notification.content.workshopId;
        let status = await this.channel.status(order.id, id);
        if (!status) {
          if (order.automation!.notifiedWorkshopIds.includes(id)) throw new Error('Hay un aviso sin resultado confirmado. Requiere conciliación.');
          const workshop = await this.workshops.get(id);
          if (!workshop?.contactPhone) throw new Error('Falta el teléfono de un taller asignado.');
          await save({ notifiedWorkshopIds: [...order.automation!.notifiedWorkshopIds, id] });
          status = await this.channel.assign(order, notification, quotation, `51${workshop.contactPhone}`, workshopAvailabilityReference(order, id));
        }
        if (status.lastError || !status.effects.some((effect) => effect.phase === 'order' && effect.state === 'accepted')) {
          throw new Error('La asignación quedó guardada, pero falta comprobar el aviso al taller. Revisa el envío.');
        }
      }
      await save({ phase: 'assigned', message: 'Asignación completada. Los talleres ya confirmaron.' });
    } catch (error) {
      await save({ phase: 'paused', message: error instanceof AssignmentFlowError && error.code === 'capacity_changed' ? 'La capacidad o el plazo cambió. La propuesta requiere revisión.' : error instanceof Error ? error.message : 'La asignación requiere revisión.' });
    } finally {
      const current = await this.orders.get(initial.id);
      if (current?.automation?.lease?.owner === this.owner) {
        const { lease: _lease, ...state } = current.automation;
        await this.orders.updateAutomation(current.id, current.automation.revision, { ...state, revision: state.revision + 1 });
      }
    }
  }
}
