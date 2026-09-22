-- R01 review repair: a step keeps its identity and Organization even when its
-- configurator belongs to both tenants. Existing RLS still checks editable
-- template/Training Type references and Onboarding capability/scope.
BEGIN;

REVOKE UPDATE ON public.onboarding_template_steps FROM authenticated;
GRANT UPDATE (template_id, name, description, step_type, training_type_id, stages, sort_order)
ON public.onboarding_template_steps TO authenticated;

COMMIT;
