CREATE TABLE IF NOT EXISTS thesis_orders (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('registered', 'recommended', 'assigned', 'in_production', 'completed')),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS thesis_order_status_history (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL REFERENCES thesis_orders(id),
  status text NOT NULL,
  occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS thesis_orders_status_idx ON thesis_orders(status);
CREATE INDEX IF NOT EXISTS thesis_order_history_order_idx ON thesis_order_status_history(order_id, occurred_at);

CREATE TABLE IF NOT EXISTS thesis_quotation_requests (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('pending_quote', 'quoted', 'accepted', 'rejected')),
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS thesis_quotation_requests_status_idx
  ON thesis_quotation_requests(status);
CREATE INDEX IF NOT EXISTS thesis_quotation_requests_owner_subject_idx
  ON thesis_quotation_requests ((payload->'owner'->>'subject'));
