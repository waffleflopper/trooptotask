import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = entityHandlers(OnboardingTemplateStepEntity);
