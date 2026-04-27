import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { userRole } = await parent();
	return {
		canAccessOrganizationGovernance: userRole === 'owner' || userRole === 'admin'
	};
};
