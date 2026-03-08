import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	throw redirect(301, `/org/${params.orgId}/admin/audit`);
};
