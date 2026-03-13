-- Getting Started checklist dismissal tracking
CREATE TABLE getting_started_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE getting_started_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own getting started progress"
  ON getting_started_progress FOR ALL
  USING (auth.uid() = user_id);
