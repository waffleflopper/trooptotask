import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchRosterHistory } from '$lib/server/core/useCases/rosterHistoryQuery';
import { listDutyTemplates } from '$lib/server/core/useCases/dutyTemplateCrud';
import { listDutyEvents } from '$lib/server/core/useCases/dutyEventCrud';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		fn: async (ctx) => {
			const [rosterHistory, advancedDutyEvents] = await Promise.all([fetchRosterHistory(ctx), listDutyEvents(ctx)]);
			const advancedDutyTemplates = ctx.auth.isPrivileged ? await listDutyTemplates(ctx) : [];
			return { rosterHistory, advancedDutyTemplates, advancedDutyEvents };
		}
	});
};
