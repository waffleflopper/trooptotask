import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	throw redirect(303, `/org/${params.orgId}/admin/approvals`);
};
