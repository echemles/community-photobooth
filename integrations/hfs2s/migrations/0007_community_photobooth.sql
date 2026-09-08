CREATE TABLE IF NOT EXISTS community_photo_deliveries (
  id uuid PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  recipient text,
  png text,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','accepted','sent','failed','expired')),
  attempts integer NOT NULL DEFAULT 0,
  lease_token text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours'
);
CREATE INDEX IF NOT EXISTS community_photo_pending ON community_photo_deliveries(status, created_at);
