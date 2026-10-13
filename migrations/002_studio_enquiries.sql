-- Studio enquiries are independent of SaaS companies and are not exposed by /api/data.
CREATE TABLE IF NOT EXISTS studio_enquiries (
  id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_enquiries_created ON studio_enquiries(created_at DESC);

-- Shared across Render processes; only a keyed hash of the request IP is stored.
CREATE TABLE IF NOT EXISTS studio_request_limits (
  key_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK(attempts > 0)
);
