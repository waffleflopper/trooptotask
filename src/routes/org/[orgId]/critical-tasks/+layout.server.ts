import type { LayoutServerLoad } from './$types';
import { requireReadyAppShell } from '$lib/server/adapters/appShellRouteData';
import { requireFeatureOn } from '$lib/server/adapters/featureSwitchRoute';

export const load: LayoutServerLoad = async (event) => {
	event.depends('app:org-core');
	await requireFeatureOn(event, 'criticalTasks');
	requireReadyAppShell(await event.parent());
	return {};
};
