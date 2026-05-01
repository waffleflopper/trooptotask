import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { TrainingType } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { PersonnelOnboardingEntity } from '$lib/server/entities/personnelOnboarding';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { GroupEntity } from '$lib/server/entities/group';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { getTrainingStepCompletionStatuses } from './onboardingStepProgress';
import type { WritePorts } from '$lib/server/core/ports';

export interface OnboardingBootstrap {
	onboardingTemplates: OnboardingTemplate[];
	onboardingTemplateSteps: OnboardingTemplateStep[];
	onboardings: PersonnelOnboarding[];
	personnel: Personnel[];
	groups: Group[];
	trainingTypes: TrainingType[];
}

export async function fetchOnboardingBootstrap(ctx: WritePorts): Promise<OnboardingBootstrap> {
	const orgId = ctx.auth.orgId;

	const [templateRows, templateStepRows, onboardingRows, personnelRows, groupRows, trainingTypeRows] =
		await Promise.all([
			ctx.store.findMany<Record<string, unknown>>('onboarding_templates', orgId, undefined, {
				orderBy: [{ column: 'name', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>('onboarding_template_steps', orgId, undefined, {
				orderBy: [{ column: 'sort_order', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>('personnel_onboardings', orgId, undefined, {
				select: PersonnelOnboardingEntity.select
			}),
			ctx.store.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
				select: PersonnelEntity.select,
				isNull: { archived_at: true },
				orderBy: [{ column: 'last_name', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
				orderBy: [{ column: 'sort_order', ascending: true }]
			}),
			ctx.store.findMany<Record<string, unknown>>('training_types', orgId, undefined, {
				orderBy: [{ column: 'sort_order', ascending: true }]
			})
		]);

	const templates = OnboardingTemplateEntity.fromDbArray(templateRows);
	const templateSteps = OnboardingTemplateStepEntity.fromDbArray(templateStepRows);
	const allOnboardings = PersonnelOnboardingEntity.fromDbArray(onboardingRows);
	const personnel = PersonnelEntity.fromDbArray(personnelRows);
	const groups = GroupEntity.fromDbArray(groupRows);
	const trainingTypes = TrainingTypeEntity.fromDbArray(trainingTypeRows);

	// personnel_onboardings has no group column so the scoped store cannot filter it automatically.
	// When scoped, query personnel (which the scoped store does filter by group) to get the
	// personnel ID set, then restrict onboardings to those members.
	let onboardings = allOnboardings;
	if (ctx.auth.scopedGroupId) {
		const scopedPersonnelIds = new Set(personnel.map((p) => p.id));
		onboardings = allOnboardings.filter((o) => scopedPersonnelIds.has(o.personnelId));
	}

	// Refresh training step completion server-side for active in-progress onboardings.
	const activeOnboardings = onboardings.filter((o) => o.status === 'in_progress');
	const trainingOnboardings = activeOnboardings.filter((o) =>
		o.steps.some((s) => s.stepType === 'training' && s.active)
	);

	if (trainingOnboardings.length > 0) {
		const refreshResults = await Promise.all(
			trainingOnboardings.map((o) => getTrainingStepCompletionStatuses(ctx, { onboardingId: o.id }))
		);
		const refreshedStepsByOnboardingId = new Map(
			trainingOnboardings.map((onboarding, index) => {
				const refreshMap = new Map(refreshResults[index].map((result) => [result.id, result.completed]));
				return [
					onboarding.id,
					onboarding.steps.map((step) =>
						step.stepType === 'training' && refreshMap.has(step.id)
							? { ...step, completed: refreshMap.get(step.id)! }
							: step
					)
				];
			})
		);

		onboardings = onboardings.map((onboarding) =>
			refreshedStepsByOnboardingId.has(onboarding.id)
				? { ...onboarding, steps: refreshedStepsByOnboardingId.get(onboarding.id)! }
				: onboarding
		);
	}

	return {
		onboardingTemplates: templates,
		onboardingTemplateSteps: templateSteps,
		onboardings,
		personnel,
		groups,
		trainingTypes
	};
}
