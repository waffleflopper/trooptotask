import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchRosterHistory } from '$lib/server/core/useCases/rosterHistoryQuery';
import { canAccessAdvancedDuty } from '$lib/server/core/useCases/advancedDutyAccess';
import {
	listAdvancedDutyRevisionDrafts,
	listAdvancedDutyRevisionHistory
} from '$lib/server/core/useCases/advancedDutyRevisionDrafts';
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
			const [rosterHistory, advancedDutyEvents] = await Promise.all([
				fetchRosterHistory(ctx),
				listDutyEventsForCalendar(ctx)
			]);
			const appliedRunIds = [
				...new Set(advancedDutyEvents.map((event) => event.runId).filter((runId): runId is string => Boolean(runId)))
			];
			const [advancedDutyTemplates, advancedDutySnapshots, advancedDutyRevisionHistory, advancedDutyRevisionDrafts] =
				await Promise.all([
					canUseAdvancedDuty ? listDutyTemplates(ctx) : Promise.resolve([]),
					canUseAdvancedDuty ? listVisibleAdvancedDutyRunSnapshotSummaries(ctx) : Promise.resolve([]),
					listAdvancedDutyRevisionHistory(ctx, { appliedRunIds }),
					canUseAdvancedDuty ? listAdvancedDutyRevisionDrafts(ctx) : Promise.resolve([])
				]);
			const appliedRunIdSet = new Set(appliedRunIds);
			return {
				rosterHistory,
				advancedDutyTemplates,
				advancedDutyEvents,
				advancedDutySnapshots,
				advancedDutyRevisionHistory,
				advancedDutyRevisionDrafts: advancedDutyRevisionDrafts.filter(
					(draft) => draft.status === 'draft' && appliedRunIdSet.has(draft.appliedRunId)
				)
			};
		}
	});
};
