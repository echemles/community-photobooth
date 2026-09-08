CREATE TABLE IF NOT EXISTS community_photo_ai (
  id uuid PRIMARY KEY,
  fingerprint text NOT NULL,
  style text NOT NULL CHECK (style IN ('illustrated','clay','retro')),
  status text NOT NULL DEFAULT 'submitting' CHECK (status IN ('submitting','processing','completed','failed','uncertain','expired')),
  provider_task_id text,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  poll_after timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_photo_ai_created ON community_photo_ai(created_at);
