import { Pool } from 'pg';
import { workshopSchema, type Workshop } from '../domain/contracts.js';
import { ensurePostgresSchema } from './postgres-schema.js';

export interface WorkshopStore {
  list(): Promise<Workshop[]>;
  get(id: string): Promise<Workshop | undefined>;
  upsertAll(workshops: Workshop[], updatedAt?: string): Promise<void>;
}

export class MemoryWorkshopStore implements WorkshopStore {
  private readonly workshops = new Map<string, Workshop>();

  constructor(initial: Workshop[] = []) {
    for (const workshop of initial) this.workshops.set(workshop.id, workshopSchema.parse(workshop));
  }

  async list(): Promise<Workshop[]> {
    return [...this.workshops.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  async get(id: string): Promise<Workshop | undefined> {
    return this.workshops.get(id);
  }

  async upsertAll(workshops: Workshop[], _updatedAt?: string): Promise<void> {
    for (const workshop of workshops)
      this.workshops.set(workshop.id, workshopSchema.parse(workshop));
  }
}

export class PostgresWorkshopStore implements WorkshopStore {
  private readonly ready: Promise<void>;

  constructor(
    private readonly pool: Pool,
    initial: Workshop[] = [],
  ) {
    this.ready = this.initialize(initial);
  }

  private async initialize(initial: Workshop[]): Promise<void> {
    await ensurePostgresSchema(this.pool);
    if (initial.length > 0) await this.persistAll(initial, new Date().toISOString());
  }

  async list(): Promise<Workshop[]> {
    await this.ready;
    const result = await this.pool.query<{ payload: Workshop }>(
      'SELECT payload FROM workshops ORDER BY id',
    );
    return result.rows.map((row) => workshopSchema.parse(row.payload));
  }

  async get(id: string): Promise<Workshop | undefined> {
    await this.ready;
    const result = await this.pool.query<{ payload: Workshop }>(
      'SELECT payload FROM workshops WHERE id = $1',
      [id],
    );
    return result.rows[0] ? workshopSchema.parse(result.rows[0].payload) : undefined;
  }

  async upsertAll(workshops: Workshop[], updatedAt = new Date().toISOString()): Promise<void> {
    await this.ready;
    await this.persistAll(workshops, updatedAt);
  }

  private async persistAll(workshops: Workshop[], updatedAt: string): Promise<void> {
    const validated = workshops.map((workshop) => workshopSchema.parse(workshop));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const workshop of validated) {
        await client.query(
          `INSERT INTO workshops
            (id, updated_at, display_name, contact_phone, provider_type, evidence_level, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE
           SET updated_at = EXCLUDED.updated_at,
               display_name = EXCLUDED.display_name,
               contact_phone = EXCLUDED.contact_phone,
               provider_type = EXCLUDED.provider_type,
               evidence_level = EXCLUDED.evidence_level,
               payload = EXCLUDED.payload`,
          [
            workshop.id,
            updatedAt,
            workshop.displayName,
            workshop.contactPhone ?? null,
            workshop.providerType,
            workshop.evidenceLevel,
            workshop,
          ],
        );
        await client.query('DELETE FROM workshop_capabilities WHERE workshop_id = $1', [
          workshop.id,
        ]);
        const capabilities: Array<[string, string]> = [
          ...workshop.products.map((value) => ['product', value] as [string, string]),
          ...(workshop.poloTypes ?? []).map((value) => ['polo_type', value] as [string, string]),
          ...workshop.materials.map((value) => ['material', value] as [string, string]),
          ...workshop.materialFamilies.map(
            (value) => ['material_family', value] as [string, string],
          ),
          ...workshop.processes.map((value) => ['process', value] as [string, string]),
          ...workshop.technicalCapabilities.map(
            (value) => ['technical_capability', value] as [string, string],
          ),
          ...(workshop.workingDays ?? []).map(
            (value) => ['working_day', value] as [string, string],
          ),
        ];
        const uniqueCapabilities = new Map(
          capabilities.map(([kind, value]) => [`${kind}\u0000${value}`, [kind, value] as const]),
        );
        for (const [kind, value] of uniqueCapabilities.values()) {
          await client.query(
            `INSERT INTO workshop_capabilities
              (workshop_id, capability_kind, capability_value)
             VALUES ($1, $2, $3)`,
            [workshop.id, kind, value],
          );
        }

        const specializationProfile = {
          ...(workshop.embroideryProfile ? { embroidery: workshop.embroideryProfile } : {}),
          ...(workshop.vinylProfile ? { vinyl: workshop.vinylProfile } : {}),
          ...(workshop.sublimationProfile ? { sublimation: workshop.sublimationProfile } : {}),
        };
        await client.query(
          `INSERT INTO workshop_availability (
            workshop_id, capacity_status, capacity_planning_mode, capacity_unit,
            minimum_units, maximum_units, available_capacity, available_from,
            estimated_lead_time_days, estimated_total_cost, on_time_rate, defect_rate,
            production_rate_quantity, production_rate_days, specialization_profile
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15
          )
          ON CONFLICT (workshop_id) DO UPDATE SET
            capacity_status = EXCLUDED.capacity_status,
            capacity_planning_mode = EXCLUDED.capacity_planning_mode,
            capacity_unit = EXCLUDED.capacity_unit,
            minimum_units = EXCLUDED.minimum_units,
            maximum_units = EXCLUDED.maximum_units,
            available_capacity = EXCLUDED.available_capacity,
            available_from = EXCLUDED.available_from,
            estimated_lead_time_days = EXCLUDED.estimated_lead_time_days,
            estimated_total_cost = EXCLUDED.estimated_total_cost,
            on_time_rate = EXCLUDED.on_time_rate,
            defect_rate = EXCLUDED.defect_rate,
            production_rate_quantity = EXCLUDED.production_rate_quantity,
            production_rate_days = EXCLUDED.production_rate_days,
            specialization_profile = EXCLUDED.specialization_profile`,
          [
            workshop.id,
            workshop.capacityStatus,
            workshop.capacityPlanningMode ?? null,
            workshop.capacityUnit,
            workshop.minimumUnits,
            workshop.maximumUnits,
            workshop.availableCapacity,
            workshop.availableFrom ?? null,
            workshop.estimatedLeadTimeDays,
            workshop.estimatedTotalCost,
            workshop.onTimeRate,
            workshop.defectRate,
            workshop.productionRate?.quantity ?? null,
            workshop.productionRate?.days ?? null,
            specializationProfile,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createWorkshopStore(initial: Workshop[]): WorkshopStore {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return new MemoryWorkshopStore(initial);
  return new PostgresWorkshopStore(new Pool({ connectionString }), initial);
}
