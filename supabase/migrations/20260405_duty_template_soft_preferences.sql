-- ============================================================
-- Persist ordered soft-preference configuration on duty templates
-- Run manually after deploying the app code changes.
-- ============================================================

ALTER TABLE public.duty_templates
  ADD COLUMN IF NOT EXISTS soft_preferences JSONB NOT NULL DEFAULT '[
    {"type":"longest-break","enabled":true},
    {"type":"holiday-closure","enabled":true},
    {"type":"weekend","enabled":true},
    {"type":"preferred-group","enabled":true}
  ]'::jsonb;

UPDATE public.duty_templates
SET soft_preferences = '[
  {"type":"longest-break","enabled":true},
  {"type":"holiday-closure","enabled":true},
  {"type":"weekend","enabled":true},
  {"type":"preferred-group","enabled":true}
]'::jsonb
WHERE soft_preferences IS NULL
   OR jsonb_typeof(soft_preferences) <> 'array'
   OR jsonb_array_length(soft_preferences) = 0;
