import type { LayoutServerLoad } from './$types';
import { buildLayoutRequest } from '$lib/server/adapters/requestContexts.server';
import { requireFeatureOn } from '$lib/server/adapters/featureSwitchRoute';

export const load: LayoutServerLoad = async (event) => {
	event.depends('app:org-core');
	await requireFeatureOn(event, 'criticalTasks');
	await buildLayoutRequest(event.locals, event.params.orgId);
	return {};
};
