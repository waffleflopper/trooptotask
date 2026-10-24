import { error, redirect } from '@sveltejs/kit';
import { createSupabaseDashboardOrgAccessPort } from '$features/organization/index.server';
import type { PageServerLoad } from './$types';

const SECTIONS = new Set(['profile', 'security']);

// Account now lives inside a unit's shell; old links land on the same section of the first unit the dashboard lists.
export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.actor) redirect(303, '/auth/login');
	const section = params.section ?? 'profile';
	if (!SECTIONS.has(section)) error(404, 'Not found');

	const [organization] = await createSupabaseDashboardOrgAccessPort(locals).listOrganizationsForUser(
		locals.actor.userId
	);
	if (!organization) redirect(303, '/dashboard');
	redirect(303, `/org/${organization.urlSegment ?? organization.id}/account/${section}${url.search}`);
};
