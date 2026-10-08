import type { LayoutServerLoad } from './$types';
import { requireReadyAppShell } from '$lib/server/core/appShellRouteData';

export const load: LayoutServerLoad = async ({ depends, parent }) => {
	depends('app:org-core');
	requireReadyAppShell(await parent());
	return {};
};
