import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { OnboardingStepProgress } from '$features/onboarding/onboarding.types';

export const OnboardingStepProgressEntity = defineEntity<OnboardingStepProgress>({
	table: 'onboarding_step_progress',
	groupScope: 'none',
	schema: {
		id: field(z.string(), { readOnly: true }),
		onboardingId: field(z.string(), { column: 'onboarding_id' }),
		stepName: field(z.string(), { column: 'step_name' }),
		stepType: field(z.enum(['training', 'paperwork', 'checkbox']), { column: 'step_type' }),
		trainingTypeId: field(z.string().nullable(), { column: 'training_type_id', insertDefault: null }),
		stages: field(z.array(z.string()).nullable(), { insertDefault: null }),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 }),
		completed: field(z.boolean(), { insertDefault: false }),
		currentStage: field(z.string().nullable(), { column: 'current_stage', insertDefault: null }),
		notes: field(z.array(z.object({ text: z.string(), timestamp: z.string() })), { insertDefault: [] }),
		templateStepId: field(z.string().nullable(), { column: 'template_step_id', insertDefault: null }),
		active: field(z.boolean(), { insertDefault: true })
	}
});
