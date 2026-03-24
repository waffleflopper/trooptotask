import type { LayoutServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { PersonnelOnboardingEntity } from '$lib/server/entities/personnelOnboarding';
import { refreshTrainingSteps } from '$lib/server/core/useCases/onboardingStepProgress';

export const load: LayoutServerLoad = async ({ params, locals, cookies, parent, depends }) => {
	depends('app:onboarding-data');
	const { orgId } = params;

	const parentData = await parent();
	const scopedPersonnelIds = parentData.scopedGroupId
		? new Set(parentData.personnel.map((p: { id: string }) => p.id))
		: null;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'onboarding',
		fn: async (ctx) => {
			const [templateRows, templateStepRows, onboardingRows] = await Promise.all([
				ctx.store.findMany<Record<string, unknown>>('onboarding_templates', ctx.auth.orgId, undefined, {
					orderBy: [{ column: 'name', ascending: true }]
				}),
				ctx.store.findMany<Record<string, unknown>>('onboarding_template_steps', ctx.auth.orgId, undefined, {
					orderBy: [{ column: 'sort_order', ascending: true }]
				}),
				ctx.store.findMany<Record<string, unknown>>('personnel_onboardings', ctx.auth.orgId, undefined, {
					select: PersonnelOnboardingEntity.select
				})
			]);

			const templates = OnboardingTemplateEntity.fromDbArray(templateRows);
			const templateSteps = OnboardingTemplateStepEntity.fromDbArray(templateStepRows);
			const allOnboardings = PersonnelOnboardingEntity.fromDbArray(onboardingRows);

			const onboardings = scopedPersonnelIds
				? allOnboardings.filter((o) => scopedPersonnelIds.has(o.personnelId))
				: allOnboardings;

			// Refresh training step completion server-side
			const activeOnboardings = onboardings.filter((o) => o.status === 'in_progress');
			const trainingOnboardings = activeOnboardings.filter((o) =>
				o.steps.some((s) => s.stepType === 'training' && s.active)
			);

			if (trainingOnboardings.length > 0) {
				const refreshResults = await Promise.all(
					trainingOnboardings.map((o) => refreshTrainingSteps(ctx, { onboardingId: o.id }))
				);

				for (let i = 0; i < trainingOnboardings.length; i++) {
					const ob = trainingOnboardings[i];
					const refreshed = refreshResults[i];
					const refreshMap = new Map(refreshed.map((r) => [r.id, r.completed]));
					for (const step of ob.steps) {
						if (step.stepType === 'training' && refreshMap.has(step.id)) {
							step.completed = refreshMap.get(step.id)!;
						}
					}
				}
			}

			return {
				orgId,
				onboardingTemplates: templates,
				onboardingTemplateSteps: templateSteps,
				onboardings
			};
		}
	});
};
