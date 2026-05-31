import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { requireReadyAppShell } from '$lib/server/core/appShellRouteData';

export const load: LayoutServerLoad = async ({ parent }) => {
	const shell = requireReadyAppShell(await parent());
	if (shell.member.role !== 'owner' && shell.member.role !== 'admin') {
		throw error(403, 'Only organization owners and admins can access admin features');
	}
};
