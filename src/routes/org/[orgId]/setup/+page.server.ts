import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { buildSetupModel } from '$features/organization/contracts';
import { loadSetupLayout } from './setupLoad.server';

export const load: PageServerLoad = async (event) => {
	const data = await loadSetupLayout(event);
	const model = buildSetupModel({
		state: data.setupState,
		facts: await data.setupFacts,
		disabledFeatures: data.disabledFeatures
	});
	redirect(303, `/org/${data.orgUrlSegment}/setup/${model.firstUnansweredSlug}`);
};
