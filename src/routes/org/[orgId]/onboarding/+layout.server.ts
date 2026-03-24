import type { LayoutServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { PersonnelOnboardingEntity } from '$lib/server/entities/personnelOnboarding';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseReadOnlyGuard } from '$lib/server/adapters/supabaseReadOnlyGuard';
import { createSupabaseAuditAdapter } from '$lib/server/adapters/supabaseAudit';
import { createSupabaseAuthContextAdapter } from '$lib/server/adapters/supabaseAuthContext';
import { createPermissionContext } from '$lib/server/permissionContext';
import { refreshTrainingSteps } from '$lib/server/core/useCases/onboardingStepProgress';

export const load: LayoutServerLoad = async ({ params, locals, cookies, parent, depends }) => {
	depends('app:onboarding-data');
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	const parentData = await parent();
	const scopedPersonnelIds = parentData.scopedGroupId ? new Set(parentData.personnel.map((p) => p.id)) : null;

	const [templates, templateSteps, allOnboardings] = await Promise.all([
		OnboardingTemplateEntity.repo.list(supabase, orgId),
		OnboardingTemplateStepEntity.repo.list(supabase, orgId),
		PersonnelOnboardingEntity.repo.list(supabase, orgId)
	]);

	// Apply group scoping if needed
	const onboardings = scopedPersonnelIds
		? allOnboardings.filter((o) => scopedPersonnelIds.has(o.personnelId))
		: allOnboardings;

	// Refresh training step completion server-side (read-through cache)
	const activeOnboardings = onboardings.filter((o) => o.status === 'in_progress');
	const trainingOnboardings = activeOnboardings.filter((o) =>
		o.steps.some((s) => s.stepType === 'training' && s.active)
	);

	if (trainingOnboardings.length > 0 && parentData.userId) {
		const userId = parentData.userId;
		const permCtx = await createPermissionContext(supabase, userId, orgId);
		const store = createSupabaseDataStore(supabase);
		const auth = createSupabaseAuthContextAdapter(permCtx, supabase, userId, orgId);
		const audit = createSupabaseAuditAdapter(orgId, { userId, ip: '127.0.0.1', userAgent: 'server' });
		const readOnlyGuard = createSupabaseReadOnlyGuard(supabase, orgId);
		const ctx = { store, rawStore: store, auth, audit, readOnlyGuard };

		// Refresh training steps for all active onboardings with training steps
		const refreshResults = await Promise.all(
			trainingOnboardings.map((o) => refreshTrainingSteps(ctx, { onboardingId: o.id }))
		);

		// Update the in-memory onboarding data with refreshed training completion
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
};
