import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { OnboardingTemplateStep } from '$features/onboarding/onboarding.types';

export const OnboardingTemplateStepEntity = defineEntity<OnboardingTemplateStep>({
	table: 'onboarding_template_steps',
	groupScope: 'none',
	schema: {
		id: field(z.string(), { readOnly: true }),
		templateId: field(z.string(), { column: 'template_id' }),
		name: field(z.string()),
		description: field(z.string().nullable(), { insertDefault: null }),
		stepType: field(z.enum(['training', 'paperwork', 'checkbox']), { column: 'step_type' }),
		trainingTypeId: field(z.string().nullable(), { column: 'training_type_id', insertDefault: null }),
		stages: field(z.array(z.string()).nullable(), { insertDefault: null }),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 })
	}
});
