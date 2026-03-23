import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type {
	PersonnelOnboarding,
	OnboardingTemplateStep,
	OnboardingStepNote
} from '$features/onboarding/onboarding.types';

export const PersonnelOnboardingEntity = defineEntity<PersonnelOnboarding>({
	table: 'personnel_onboardings',
	groupScope: 'none',
	select: '*, onboarding_step_progress(*)',
	customTransform: (row: Record<string, unknown>) => ({
		id: row.id as string,
		personnelId: row.personnel_id as string,
		startedAt: row.started_at as string,
		completedAt: (row.completed_at as string | null) ?? null,
		cancelledAt: (row.cancelled_at as string | null) ?? null,
		status: row.status as PersonnelOnboarding['status'],
		templateId: (row.template_id as string | null) ?? null,
		steps: ((row.onboarding_step_progress as Record<string, unknown>[]) ?? [])
			.sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
			.map((s) => ({
				id: s.id as string,
				onboardingId: s.onboarding_id as string,
				stepName: s.step_name as string,
				stepType: s.step_type as OnboardingTemplateStep['stepType'],
				trainingTypeId: (s.training_type_id as string | null) ?? null,
				stages: (s.stages as string[] | null) ?? null,
				sortOrder: s.sort_order as number,
				completed: s.completed as boolean,
				currentStage: (s.current_stage as string | null) ?? null,
				notes: Array.isArray(s.notes) ? (s.notes as OnboardingStepNote[]) : [],
				templateStepId: (s.template_step_id as string | null) ?? null,
				active: (s.active as boolean) ?? true
			}))
	}),
	schema: {
		id: field(z.string(), { readOnly: true }),
		personnelId: field(z.string(), { column: 'personnel_id' }),
		startedAt: field(z.string(), { column: 'started_at' }),
		completedAt: field(z.string().nullable(), { column: 'completed_at', insertDefault: null }),
		cancelledAt: field(z.string().nullable(), { column: 'cancelled_at', insertDefault: null }),
		status: field(z.enum(['in_progress', 'completed', 'cancelled'])),
		templateId: field(z.string().nullable(), { column: 'template_id', insertDefault: null })
	}
});
