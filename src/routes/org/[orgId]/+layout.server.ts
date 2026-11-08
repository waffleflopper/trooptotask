import type { LayoutServerLoad } from './$types';
import { createRootOrgLayoutLoad } from './rootOrgLayoutLoad.server';
import { getIdentitySessionScope } from '$features/identity/index.server';
import { error } from '@sveltejs/kit';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar';

const loadShell = createRootOrgLayoutLoad();
export const load: LayoutServerLoad = async (event) => {
	const data = await loadShell(event);
	const identitySessionScope = getIdentitySessionScope(event.locals.session, event.locals.user);
	if (data.shell.kind === 'ready' && identitySessionScope?.userId !== data.shell.user.id) {
		error(503, 'Workspace session unavailable. Refresh or sign in again.');
	}
	return { ...data, identitySessionScope, sidebarOpen: event.cookies.get(SIDEBAR_COOKIE_NAME) !== 'false' };
};
