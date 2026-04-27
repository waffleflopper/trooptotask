import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	throw redirect(303, `/org/${params.orgId}/settings/audit${url.search}`);
};
