-- Migración idempotente desde los nombres provisionales usados en el prototipo.
-- ALTER TABLE conserva filas, claves, relaciones y valores de las secuencias.
DO $$
DECLARE
  old_name text;
  new_name text;
  object_record record;
BEGIN
  FOREACH old_name IN ARRAY ARRAY[
    'thesis_quotation_requests',
    'thesis_orders',
    'thesis_order_sizes',
    'thesis_order_processes',
    'thesis_order_customizations',
    'thesis_order_status_history',
    'thesis_workshops',
    'thesis_workshop_capabilities',
    'thesis_workshop_availability',
    'thesis_order_assignments',
    'thesis_assignment_allocations',
    'thesis_allocation_processes'
  ]
  LOOP
    new_name := substring(old_name FROM 8);
    IF to_regclass('public.' || quote_ident(old_name)) IS NOT NULL THEN
      IF to_regclass('public.' || quote_ident(new_name)) IS NOT NULL THEN
        RAISE EXCEPTION 'No se puede migrar %: también existe %', old_name, new_name;
      END IF;
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', old_name, new_name);
    END IF;
  END LOOP;

  FOR object_record IN
    SELECT constraint_row.conrelid, constraint_row.conname
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS table_row ON table_row.oid = constraint_row.conrelid
    JOIN pg_namespace AS namespace_row ON namespace_row.oid = table_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND constraint_row.conname LIKE 'thesis\_%' ESCAPE '\'
  LOOP
    new_name := substring(object_record.conname FROM 8);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = object_record.conrelid
        AND conname = new_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
        object_record.conrelid::regclass,
        object_record.conname,
        new_name
      );
    END IF;
  END LOOP;

  FOR object_record IN
    SELECT class_row.oid, class_row.relname, class_row.relkind
    FROM pg_class AS class_row
    JOIN pg_namespace AS namespace_row ON namespace_row.oid = class_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND class_row.relkind IN ('i', 'S')
      AND class_row.relname LIKE 'thesis\_%' ESCAPE '\'
  LOOP
    new_name := substring(object_record.relname FROM 8);
    IF to_regclass('public.' || quote_ident(new_name)) IS NULL THEN
      IF object_record.relkind = 'i' THEN
        EXECUTE format('ALTER INDEX %s RENAME TO %I', object_record.oid::regclass, new_name);
      ELSE
        EXECUTE format('ALTER SEQUENCE %s RENAME TO %I', object_record.oid::regclass, new_name);
      END IF;
    END IF;
  END LOOP;

  FOR object_record IN
    SELECT trigger_row.oid, trigger_row.tgrelid, trigger_row.tgname
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS table_row ON table_row.oid = trigger_row.tgrelid
    JOIN pg_namespace AS namespace_row ON namespace_row.oid = table_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgname LIKE 'thesis\_%' ESCAPE '\'
  LOOP
    new_name := substring(object_record.tgname FROM 8);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = object_record.tgrelid
        AND tgname = new_name
    ) THEN
      EXECUTE format(
        'ALTER TRIGGER %I ON %s RENAME TO %I',
        object_record.tgname,
        object_record.tgrelid::regclass,
        new_name
      );
    END IF;
  END LOOP;

  FOR object_record IN
    SELECT procedure_row.oid, procedure_row.proname
    FROM pg_proc AS procedure_row
    JOIN pg_namespace AS namespace_row ON namespace_row.oid = procedure_row.pronamespace
    WHERE namespace_row.nspname = 'public'
      AND procedure_row.proname LIKE 'thesis\_%' ESCAPE '\'
  LOOP
    new_name := substring(object_record.proname FROM 8);
    EXECUTE format(
      'ALTER FUNCTION %s RENAME TO %I',
      object_record.oid::regprocedure,
      new_name
    );
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS quotation_requests (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('pending_quote', 'quoted', 'accepted', 'rejected')),
  payload jsonb NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotation_requests_status_check'
      AND conrelid = 'quotation_requests'::regclass
  ) THEN
    ALTER TABLE quotation_requests ADD CONSTRAINT quotation_requests_status_check
      CHECK (status IN ('pending_quote', 'quoted', 'accepted', 'rejected'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('registered', 'recommended', 'assigned', 'in_production', 'completed')),
  product text,
  polo_type text,
  quantity integer,
  material text,
  color text,
  customization text,
  required_by date,
  delivery_district text,
  design_reference text,
  notes text,
  requires_new_pattern boolean NOT NULL DEFAULT false,
  embroidery_applications_per_garment integer NOT NULL DEFAULT 1,
  source_quotation_id text,
  source_garment_index integer,
  payload jsonb NOT NULL
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS product text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS polo_type text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS material text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customization text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS required_by date;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_district text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS design_reference text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS requires_new_pattern boolean;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS embroidery_applications_per_garment integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_quotation_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_garment_index integer;

UPDATE orders
SET product = COALESCE(product, payload->'draft'->>'product'),
    polo_type = COALESCE(polo_type, payload->'draft'->>'poloType'),
    quantity = COALESCE(quantity, (payload->'draft'->>'quantity')::integer),
    material = COALESCE(material, payload->'draft'->>'material'),
    color = COALESCE(color, payload->'draft'->>'color'),
    customization = COALESCE(customization, payload->'draft'->>'customization'),
    required_by = COALESCE(required_by, (payload->'draft'->>'requiredBy')::date),
    delivery_district = COALESCE(delivery_district, payload->'draft'->>'deliveryDistrict'),
    design_reference = COALESCE(design_reference, payload->'draft'->>'designReference'),
    notes = COALESCE(notes, payload->'draft'->>'notes', ''),
    requires_new_pattern = COALESCE(requires_new_pattern, (payload->'draft'->>'requiresNewPattern')::boolean, false),
    embroidery_applications_per_garment = COALESCE(embroidery_applications_per_garment, (payload->'draft'->>'embroideryApplicationsPerGarment')::integer, 1),
    source_quotation_id = COALESCE(source_quotation_id, payload->'source'->>'quotationId'),
    source_garment_index = COALESCE(source_garment_index, (payload->'source'->>'garmentIndex')::integer)
WHERE product IS NULL
   OR quantity IS NULL
   OR material IS NULL
   OR color IS NULL
   OR customization IS NULL
   OR required_by IS NULL
   OR delivery_district IS NULL
   OR design_reference IS NULL
   OR notes IS NULL
   OR requires_new_pattern IS NULL
   OR embroidery_applications_per_garment IS NULL;

ALTER TABLE orders ALTER COLUMN product SET NOT NULL;
ALTER TABLE orders ALTER COLUMN quantity SET NOT NULL;
ALTER TABLE orders ALTER COLUMN material SET NOT NULL;
ALTER TABLE orders ALTER COLUMN color SET NOT NULL;
ALTER TABLE orders ALTER COLUMN customization SET NOT NULL;
ALTER TABLE orders ALTER COLUMN required_by SET NOT NULL;
ALTER TABLE orders ALTER COLUMN delivery_district SET NOT NULL;
ALTER TABLE orders ALTER COLUMN design_reference SET NOT NULL;
ALTER TABLE orders ALTER COLUMN notes SET NOT NULL;
ALTER TABLE orders ALTER COLUMN requires_new_pattern SET NOT NULL;
ALTER TABLE orders ALTER COLUMN embroidery_applications_per_garment SET NOT NULL;
ALTER TABLE orders ALTER COLUMN requires_new_pattern SET DEFAULT false;
ALTER TABLE orders ALTER COLUMN embroidery_applications_per_garment SET DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_status_check' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN ('registered', 'recommended', 'assigned', 'in_production', 'completed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_product_check' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_product_check CHECK (product IN ('polo', 'buzo'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_quantity_check' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_quantity_check CHECK (quantity > 0 AND quantity <= 5000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_customization_check' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_customization_check
      CHECK (customization IN ('none', 'printing', 'embroidery', 'sublimation', 'vinyl'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_source_garment_index_check' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_source_garment_index_check
      CHECK (source_garment_index IS NULL OR source_garment_index >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_polo_type_check' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_polo_type_check
      CHECK (polo_type IS NULL OR polo_type IN (
        'cotton_basic', 'cotton_advertising', 'collared', 'sports', 'stretch'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_embroidery_applications_check' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_embroidery_applications_check
      CHECK (embroidery_applications_per_garment > 0 AND embroidery_applications_per_garment <= 20);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_source_quotation_fkey' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_source_quotation_fkey
      FOREIGN KEY (source_quotation_id) REFERENCES quotation_requests(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS order_sizes (
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  size text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (order_id, size)
);

CREATE TABLE IF NOT EXISTS order_processes (
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sequence smallint NOT NULL CHECK (sequence > 0),
  process text NOT NULL CHECK (process IN (
    'fabric_sourcing', 'design', 'transfer_printing', 'patternmaking', 'cutting',
    'sewing', 'sublimation', 'printing', 'vinyl', 'embroidery', 'notions',
    'ironing', 'finishing', 'quality_control', 'delivery'
  )),
  PRIMARY KEY (order_id, sequence),
  UNIQUE (order_id, process)
);

CREATE TABLE IF NOT EXISTS order_customizations (
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sequence smallint NOT NULL CHECK (sequence > 0),
  kind text NOT NULL CHECK (kind IN ('printing', 'embroidery', 'sublimation', 'vinyl')),
  applications_per_garment integer CHECK (applications_per_garment > 0),
  PRIMARY KEY (order_id, sequence),
  UNIQUE (order_id, kind)
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('registered', 'recommended', 'assigned', 'in_production', 'completed')),
  occurred_at timestamptz NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'order_status_history_status_check'
      AND conrelid = 'order_status_history'::regclass
  ) THEN
    ALTER TABLE order_status_history ADD CONSTRAINT order_status_history_status_check
      CHECK (status IN ('registered', 'recommended', 'assigned', 'in_production', 'completed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS workshops (
  id text PRIMARY KEY,
  updated_at timestamptz NOT NULL,
  display_name text,
  contact_phone text,
  provider_type text,
  evidence_level text,
  payload jsonb NOT NULL
);

ALTER TABLE workshops ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS provider_type text;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS evidence_level text;

UPDATE workshops
SET display_name = COALESCE(display_name, payload->>'displayName'),
    contact_phone = COALESCE(contact_phone, payload->>'contactPhone'),
    provider_type = COALESCE(provider_type, payload->>'providerType'),
    evidence_level = COALESCE(evidence_level, payload->>'evidenceLevel');

ALTER TABLE workshops ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE workshops ALTER COLUMN provider_type SET NOT NULL;
ALTER TABLE workshops ALTER COLUMN evidence_level SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workshops_contact_phone_check' AND conrelid = 'workshops'::regclass
  ) THEN
    ALTER TABLE workshops ADD CONSTRAINT workshops_contact_phone_check
      CHECK (contact_phone IS NULL OR contact_phone ~ '^9[0-9]{8}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workshops_provider_type_check' AND conrelid = 'workshops'::regclass
  ) THEN
    ALTER TABLE workshops ADD CONSTRAINT workshops_provider_type_check
      CHECK (provider_type IN ('garment_producer', 'process_provider'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workshops_evidence_level_check' AND conrelid = 'workshops'::regclass
  ) THEN
    ALTER TABLE workshops ADD CONSTRAINT workshops_evidence_level_check
      CHECK (evidence_level IN ('declared', 'verified', 'historical'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS workshop_capabilities (
  workshop_id text NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  capability_kind text NOT NULL CHECK (capability_kind IN (
    'product', 'polo_type', 'material', 'material_family', 'process', 'technical_capability', 'working_day'
  )),
  capability_value text NOT NULL,
  PRIMARY KEY (workshop_id, capability_kind, capability_value)
);

CREATE TABLE IF NOT EXISTS workshop_availability (
  workshop_id text PRIMARY KEY REFERENCES workshops(id) ON DELETE CASCADE,
  capacity_status text NOT NULL CHECK (capacity_status IN ('known', 'unknown')),
  capacity_planning_mode text CHECK (capacity_planning_mode IS NULL OR capacity_planning_mode IN ('fixed', 'throughput')),
  capacity_unit text NOT NULL CHECK (capacity_unit IN ('garments', 'sets', 'panels', 'logos', 'patterns')),
  minimum_units integer NOT NULL CHECK (minimum_units >= 0),
  maximum_units integer NOT NULL CHECK (maximum_units > 0),
  available_capacity integer NOT NULL CHECK (available_capacity >= 0),
  available_from timestamptz,
  estimated_lead_time_days numeric(10, 3) NOT NULL CHECK (estimated_lead_time_days >= 0),
  estimated_total_cost numeric(14, 2) NOT NULL CHECK (estimated_total_cost >= 0),
  on_time_rate numeric(7, 6) NOT NULL CHECK (on_time_rate BETWEEN 0 AND 1),
  defect_rate numeric(7, 6) NOT NULL CHECK (defect_rate BETWEEN 0 AND 1),
  production_rate_quantity numeric(14, 3) CHECK (production_rate_quantity > 0),
  production_rate_days numeric(10, 3) CHECK (production_rate_days > 0),
  specialization_profile jsonb,
  CHECK (maximum_units >= minimum_units)
);

CREATE TABLE IF NOT EXISTS order_assignments (
  order_id text PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  confirmed_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS assignment_allocations (
  order_id text NOT NULL REFERENCES order_assignments(order_id) ON DELETE CASCADE,
  workshop_id text NOT NULL REFERENCES workshops(id),
  display_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('assigned', 'in_production', 'completed')),
  PRIMARY KEY (order_id, workshop_id)
);

CREATE TABLE IF NOT EXISTS allocation_processes (
  order_id text NOT NULL,
  workshop_id text NOT NULL,
  sequence smallint NOT NULL CHECK (sequence > 0),
  process text NOT NULL CHECK (process IN (
    'fabric_sourcing', 'design', 'transfer_printing', 'patternmaking', 'cutting',
    'sewing', 'sublimation', 'printing', 'vinyl', 'embroidery', 'notions',
    'ironing', 'finishing', 'quality_control', 'delivery'
  )),
  PRIMARY KEY (order_id, workshop_id, sequence),
  UNIQUE (order_id, workshop_id, process),
  FOREIGN KEY (order_id, workshop_id)
    REFERENCES assignment_allocations(order_id, workshop_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS quotation_requests_status_idx ON quotation_requests(status);
CREATE INDEX IF NOT EXISTS quotation_requests_owner_subject_idx
  ON quotation_requests ((payload->'owner'->>'subject'));
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_required_by_idx ON orders(required_by);
CREATE INDEX IF NOT EXISTS order_history_order_idx
  ON order_status_history(order_id, occurred_at);
CREATE INDEX IF NOT EXISTS workshops_provider_type_idx ON workshops(provider_type);
CREATE INDEX IF NOT EXISTS workshop_capability_lookup_idx
  ON workshop_capabilities(capability_kind, capability_value);
CREATE INDEX IF NOT EXISTS assignment_allocations_workshop_idx
  ON assignment_allocations(workshop_id, status);

INSERT INTO order_sizes (order_id, size, quantity)
SELECT orders.id, sizes.key, sizes.value::integer
FROM orders AS orders
CROSS JOIN LATERAL jsonb_each_text(orders.payload->'draft'->'sizes') AS sizes
ON CONFLICT (order_id, size) DO NOTHING;

INSERT INTO order_processes (order_id, sequence, process)
SELECT orders.id, processes.ordinality::smallint, processes.value
FROM orders AS orders
CROSS JOIN LATERAL jsonb_array_elements_text(orders.payload->'requiredProcesses')
  WITH ORDINALITY AS processes(value, ordinality)
ON CONFLICT (order_id, sequence) DO NOTHING;

INSERT INTO order_customizations (order_id, sequence, kind, applications_per_garment)
SELECT orders.id, 1, orders.payload->'draft'->>'customization',
       CASE WHEN orders.payload->'draft'->>'customization' = 'embroidery'
         THEN COALESCE((orders.payload->'draft'->>'embroideryApplicationsPerGarment')::integer, 1)
         ELSE NULL END
FROM orders AS orders
WHERE orders.payload->'draft'->>'customization' <> 'none'
ON CONFLICT (order_id, sequence) DO NOTHING;

INSERT INTO order_customizations (order_id, sequence, kind, applications_per_garment)
SELECT orders.id, (customizations.ordinality + 1)::smallint, customizations.value,
       CASE WHEN customizations.value = 'embroidery'
         THEN COALESCE((orders.payload->'draft'->>'embroideryApplicationsPerGarment')::integer, 1)
         ELSE NULL END
FROM orders AS orders
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(orders.payload->'draft'->'additionalCustomizations', '[]'::jsonb)
) WITH ORDINALITY AS customizations(value, ordinality)
ON CONFLICT DO NOTHING;

INSERT INTO workshop_capabilities (workshop_id, capability_kind, capability_value)
SELECT workshops.id, capabilities.kind, capabilities.value
FROM workshops AS workshops
CROSS JOIN LATERAL (
  SELECT 'product'::text, value FROM jsonb_array_elements_text(workshops.payload->'products')
  UNION ALL SELECT 'polo_type', value FROM jsonb_array_elements_text(COALESCE(workshops.payload->'poloTypes', '[]'::jsonb))
  UNION ALL SELECT 'material', value FROM jsonb_array_elements_text(workshops.payload->'materials')
  UNION ALL SELECT 'material_family', value FROM jsonb_array_elements_text(workshops.payload->'materialFamilies')
  UNION ALL SELECT 'process', value FROM jsonb_array_elements_text(workshops.payload->'processes')
  UNION ALL SELECT 'technical_capability', value FROM jsonb_array_elements_text(COALESCE(workshops.payload->'technicalCapabilities', '[]'::jsonb))
  UNION ALL SELECT 'working_day', value FROM jsonb_array_elements_text(COALESCE(workshops.payload->'workingDays', '[]'::jsonb))
) AS capabilities(kind, value)
ON CONFLICT DO NOTHING;

INSERT INTO workshop_availability (
  workshop_id, capacity_status, capacity_planning_mode, capacity_unit,
  minimum_units, maximum_units, available_capacity, available_from,
  estimated_lead_time_days, estimated_total_cost, on_time_rate, defect_rate,
  production_rate_quantity, production_rate_days, specialization_profile
)
SELECT id,
       COALESCE(payload->>'capacityStatus', 'known'),
       payload->>'capacityPlanningMode',
       COALESCE(payload->>'capacityUnit', 'garments'),
       (payload->>'minimumUnits')::integer,
       (payload->>'maximumUnits')::integer,
       (payload->>'availableCapacity')::integer,
       (payload->>'availableFrom')::timestamptz,
       (payload->>'estimatedLeadTimeDays')::numeric,
       (payload->>'estimatedTotalCost')::numeric,
       (payload->>'onTimeRate')::numeric,
       (payload->>'defectRate')::numeric,
       (payload->'productionRate'->>'quantity')::numeric,
       (payload->'productionRate'->>'days')::numeric,
       jsonb_strip_nulls(jsonb_build_object(
         'embroidery', payload->'embroideryProfile',
         'vinyl', payload->'vinylProfile',
         'sublimation', payload->'sublimationProfile'
       ))
FROM workshops
ON CONFLICT (workshop_id) DO NOTHING;

INSERT INTO order_assignments (order_id, candidate_id, confirmed_at)
SELECT id, payload->'assignment'->>'candidateId', (payload->'assignment'->>'confirmedAt')::timestamptz
FROM orders
WHERE payload->'assignment' IS NOT NULL
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO assignment_allocations (order_id, workshop_id, display_name, quantity, status)
SELECT orders.id,
       allocations.value->>'workshopId',
       allocations.value->>'displayName',
       (allocations.value->>'quantity')::integer,
       allocations.value->>'status'
FROM orders AS orders
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(orders.payload->'assignment'->'allocations', '[]'::jsonb)
) AS allocations(value)
WHERE orders.payload->'assignment' IS NOT NULL
ON CONFLICT (order_id, workshop_id) DO NOTHING;

INSERT INTO allocation_processes (order_id, workshop_id, sequence, process)
SELECT orders.id,
       allocations.value->>'workshopId',
       processes.ordinality::smallint,
       processes.value
FROM orders AS orders
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(orders.payload->'assignment'->'allocations', '[]'::jsonb)
) AS allocations(value)
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(allocations.value->'assignedProcesses', '[]'::jsonb)
) WITH ORDINALITY AS processes(value, ordinality)
WHERE orders.payload->'assignment' IS NOT NULL
ON CONFLICT (order_id, workshop_id, sequence) DO NOTHING;

CREATE OR REPLACE FUNCTION check_order_size_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_order_id text;
  expected_quantity integer;
  stored_quantity bigint;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    affected_order_id := NEW.id;
  ELSE
    affected_order_id := COALESCE(NEW.order_id, OLD.order_id);
  END IF;

  SELECT quantity INTO expected_quantity
  FROM orders
  WHERE id = affected_order_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(quantity), 0) INTO stored_quantity
  FROM order_sizes
  WHERE order_id = affected_order_id;

  IF stored_quantity <> expected_quantity THEN
    RAISE EXCEPTION
      'La suma de tallas (%) no coincide con la cantidad del pedido % (%)',
      stored_quantity, affected_order_id, expected_quantity
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION check_allocation_quantity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  order_quantity integer;
BEGIN
  SELECT quantity INTO STRICT order_quantity
  FROM orders
  WHERE id = NEW.order_id;

  IF NEW.quantity > order_quantity THEN
    RAISE EXCEPTION
      'La cantidad de la asignación (%) supera la cantidad del pedido % (%)',
      NEW.quantity, NEW.order_id, order_quantity
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'orders_size_total_trigger'
      AND tgrelid = 'orders'::regclass
  ) THEN
    CREATE CONSTRAINT TRIGGER orders_size_total_trigger
      AFTER INSERT OR UPDATE OF quantity ON orders
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION check_order_size_total();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'order_sizes_total_trigger'
      AND tgrelid = 'order_sizes'::regclass
  ) THEN
    CREATE CONSTRAINT TRIGGER order_sizes_total_trigger
      AFTER INSERT OR UPDATE OR DELETE ON order_sizes
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION check_order_size_total();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'assignment_allocation_quantity_trigger'
      AND tgrelid = 'assignment_allocations'::regclass
  ) THEN
    CREATE TRIGGER assignment_allocation_quantity_trigger
      BEFORE INSERT OR UPDATE OF quantity ON assignment_allocations
      FOR EACH ROW EXECUTE FUNCTION check_allocation_quantity();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM orders AS orders
    LEFT JOIN (
      SELECT order_id, sum(quantity) AS quantity
      FROM order_sizes
      GROUP BY order_id
    ) AS sizes ON sizes.order_id = orders.id
    WHERE COALESCE(sizes.quantity, 0) <> orders.quantity
  ) THEN
    RAISE EXCEPTION 'Existen pedidos cuya suma de tallas no coincide con la cantidad total'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM assignment_allocations AS allocations
    JOIN orders AS orders ON orders.id = allocations.order_id
    WHERE allocations.quantity > orders.quantity
  ) THEN
    RAISE EXCEPTION 'Existen asignaciones que superan la cantidad del pedido'
      USING ERRCODE = '23514';
  END IF;
END $$;
