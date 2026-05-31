import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireReadyAppShell } from '$lib/server/core/appShellRouteData';

export const load: PageServerLoad = async ({ parent }) => {
	const shell = requireReadyAppShell(await parent());
	redirect(303, `/org/${shell.org.urlSegment}/settings/general`);
};
