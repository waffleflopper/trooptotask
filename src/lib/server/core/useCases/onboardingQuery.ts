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
import type { WritePorts } from '$lib/server/core/ports';
import { requireOnboardingViewPolicy } from './onboardingPolicy';

export interface OnboardingBootstrap {
	onboardingTemplates: OnboardingTemplate[];
	onboardingTemplateSteps: OnboardingTemplateStep[];
	onboardings: PersonnelOnboarding[];
	personnel: Personnel[];
	groups: Group[];
	trainingTypes: TrainingType[];
}

function applyTrainingCompletionStatuses(
	onboarding: PersonnelOnboarding,
	completedTrainingTypeIdsByPersonnelId: Map<string, Set<string>>
): PersonnelOnboarding {
	const completedTrainingTypeIds = completedTrainingTypeIdsByPersonnelId.get(onboarding.personnelId) ?? new Set();

	return {
		...onboarding,
		steps: onboarding.steps.map((step) => {
			if (step.stepType !== 'training' || !step.active || step.trainingTypeId === null) {
				return step;
			}

			return { ...step, completed: completedTrainingTypeIds.has(step.trainingTypeId) };
		})
	};
}

function collectActiveTrainingTypeIds(onboarding: PersonnelOnboarding): string[] {
	return onboarding.steps
		.filter((step) => step.stepType === 'training' && step.active && step.trainingTypeId !== null)
		.map((step) => step.trainingTypeId as string);
}

async function readCompletedTrainingTypeIdsByPersonnelId(
	ctx: WritePorts,
	trainingOnboardings: PersonnelOnboarding[]
): Promise<Map<string, Set<string>>> {
	const personnelIds = [...new Set(trainingOnboardings.map((onboarding) => onboarding.personnelId))];
	const trainingTypeIds = [
		...new Set(trainingOnboardings.flatMap((onboarding) => collectActiveTrainingTypeIds(onboarding)))
	];

	if (personnelIds.length === 0 || trainingTypeIds.length === 0) {
		return new Map();
	}

	const trainingRecords = await ctx.store.findMany<{ personnel_id: string; training_type_id: string }>(
		'personnel_trainings',
		ctx.auth.orgId,
		undefined,
		{ inFilters: { personnel_id: personnelIds, training_type_id: trainingTypeIds } }
	);

	const completedTrainingTypeIdsByPersonnelId = new Map<string, Set<string>>();
	for (const record of trainingRecords) {
		const completedTypeIds = completedTrainingTypeIdsByPersonnelId.get(record.personnel_id) ?? new Set<string>();
		completedTypeIds.add(record.training_type_id);
		completedTrainingTypeIdsByPersonnelId.set(record.personnel_id, completedTypeIds);
	}

	return completedTrainingTypeIdsByPersonnelId;
}

export async function fetchOnboardingBootstrap(ctx: WritePorts): Promise<OnboardingBootstrap> {
	await requireOnboardingViewPolicy(ctx);

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
	if (ctx.auth.scopeSet.kind === 'groups') {
		const scopedPersonnelIds = new Set(personnel.map((p) => p.id));
		onboardings = allOnboardings.filter((o) => scopedPersonnelIds.has(o.personnelId));
	}

	// Hydrate training-backed steps from current training records without requiring edit access.
	const activeOnboardings = onboardings.filter((o) => o.status === 'in_progress');
	const trainingOnboardings = activeOnboardings.filter((o) =>
		o.steps.some((s) => s.stepType === 'training' && s.active)
	);

	if (trainingOnboardings.length > 0) {
		const completedTrainingTypeIdsByPersonnelId = await readCompletedTrainingTypeIdsByPersonnelId(
			ctx,
			trainingOnboardings
		);
		const refreshedOnboardingById = new Map(
			trainingOnboardings.map((onboarding) => [
				onboarding.id,
				applyTrainingCompletionStatuses(onboarding, completedTrainingTypeIdsByPersonnelId)
			])
		);

		onboardings = onboardings.map((onboarding) => refreshedOnboardingById.get(onboarding.id) ?? onboarding);
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
