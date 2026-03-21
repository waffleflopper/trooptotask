import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, depends }) => {
	depends('app:shared-data');
	return {
		orgId: params.orgId
	};
};
