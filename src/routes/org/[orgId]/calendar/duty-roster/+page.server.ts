import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	// TODO: Remove the deprecated legacy Calendar Duty Roster route after old links have aged out.
	throw redirect(308, `/org/${params.orgId}/duty-rosters`);
};
