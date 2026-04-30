import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchRosterHistory } from '$lib/server/core/useCases/rosterHistoryQuery';
import { canAccessAdvancedDuty } from '$lib/server/core/useCases/advancedDutyAccess';
import { listDutyTemplates } from '$lib/server/core/useCases/dutyTemplateCrud';
import { listDraftAdvancedDutyRunSnapshots, listDutyEventsForCalendar } from '$lib/server/core/useCases/dutyEventCrud';

export const load = async ({ params, locals, cookies }: PageServerLoadEvent) => {
	const { orgId } = params;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		fn: async (ctx) => {
			const rosterHistory = await fetchRosterHistory(ctx);
			const advancedDutyEvents = await listDutyEventsForCalendar(ctx);
			const advancedDutyTemplates = canAccessAdvancedDuty(ctx.auth) ? await listDutyTemplates(ctx) : [];
			const advancedDutySnapshots = canAccessAdvancedDuty(ctx.auth) ? await listDraftAdvancedDutyRunSnapshots(ctx) : [];
			return { rosterHistory, advancedDutyTemplates, advancedDutyEvents, advancedDutySnapshots };
		}
	});
};
