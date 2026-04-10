import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchOnboardingTemplatesData } from '$lib/server/core/useCases/onboardingTemplatesQuery';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const parentData = await parent();
	const onboardingWorkspace = await parentData.onboarding.data;

	const data = await loadWithContext(locals, cookies, orgId, {
		permission: 'onboarding',
		fn: fetchOnboardingTemplatesData
	});

	return {
		session: locals.session,
		orgId,
		...data,
		trainingTypes: onboardingWorkspace.data.trainingTypes
	};
};
