import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const data = await parent();

	// Only owners and admins can access reports
	if (!data.isOwner && !data.isAdmin) {
		throw redirect(302, `/org/${data.orgId}/calendar`);
	}

	return {};
};
