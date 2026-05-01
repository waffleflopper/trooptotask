import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchRosterHistory } from '$lib/server/core/useCases/rosterHistoryQuery';
import { canAccessAdvancedDuty } from '$lib/server/core/useCases/advancedDutyAccess';
import { listDutyTemplates } from '$lib/server/core/useCases/dutyTemplateCrud';
import {
	listDutyEventsForCalendar,
	listVisibleAdvancedDutyRunSnapshotSummaries
} from '$lib/server/core/useCases/dutyEventCrud';

export const load = async ({ params, locals, cookies }: PageServerLoadEvent) => {
	const { orgId } = params;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		fn: async (ctx) => {
			const canUseAdvancedDuty = canAccessAdvancedDuty(ctx.auth);
			const [rosterHistory, advancedDutyEvents, advancedDutyTemplates, advancedDutySnapshots] = await Promise.all([
				fetchRosterHistory(ctx),
				listDutyEventsForCalendar(ctx),
				canUseAdvancedDuty ? listDutyTemplates(ctx) : Promise.resolve([]),
				canUseAdvancedDuty ? listVisibleAdvancedDutyRunSnapshotSummaries(ctx) : Promise.resolve([])
			]);
			return { rosterHistory, advancedDutyTemplates, advancedDutyEvents, advancedDutySnapshots };
		}
	});
};
