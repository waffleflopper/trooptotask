import { onboardingTemplateStepCrudConfig } from '$lib/server/core/useCases/onboardingTemplateCrud';
import { crudHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = crudHandlers(onboardingTemplateStepCrudConfig);
