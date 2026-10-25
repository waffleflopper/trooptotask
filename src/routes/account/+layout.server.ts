import { redirect } from '@sveltejs/kit';
import { createSupabaseDashboardOrgAccessPort } from '$features/organization/index.server';
import { getIdentitySessionScope, loadStandaloneAccount } from '$features/identity/index.server';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, depends }) => {
	if (!locals.actor) redirect(303, `/auth/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const rest = url.pathname.slice('/account'.length).replace(/^\//, '') || 'profile';
	const [organization] = await createSupabaseDashboardOrgAccessPort(locals).listOrganizationsForUser(
		locals.actor.userId
	);
	if (organization) redirect(303, `/org/${organization.urlSegment ?? organization.id}/account/${rest}${url.search}`);
	if (url.pathname === '/account' || (rest !== 'profile' && rest !== 'security')) redirect(303, '/account/profile');
	depends('app:account');
	return {
		account: await loadStandaloneAccount(locals, locals.actor.userId),
		identitySessionScope: getIdentitySessionScope(locals.session, locals.user)
	};
};
