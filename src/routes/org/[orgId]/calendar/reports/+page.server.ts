import { redirect } from '@sveltejs/kit';
import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchCalendarReportData } from '$lib/server/core/useCases/calendarReportQuery';

export const load = async ({ params, locals, cookies, parent, depends }: PageServerLoadEvent) => {
	depends('app:org-core');
	const { orgId } = params;
	const data = await parent();

	// Only owners and admins can access reports
	if (!data.isOwner && !data.isAdmin) {
		throw redirect(302, `/org/${data.orgId}/calendar`);
	}

	return loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		fn: async (ctx) => fetchCalendarReportData(ctx)
	});
};
