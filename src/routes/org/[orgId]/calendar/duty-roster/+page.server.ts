import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchRosterHistory } from '$lib/server/core/useCases/rosterHistoryQuery';
import { canAccessAdvancedDuty } from '$lib/server/core/useCases/advancedDutyAccess';
import { listDutyTemplates } from '$lib/server/core/useCases/dutyTemplateCrud';
import { listDutyEvents } from '$lib/server/core/useCases/dutyEventCrud';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		fn: async (ctx) => {
			const rosterHistory = await fetchRosterHistory(ctx);
			const [advancedDutyEvents, advancedDutyTemplates] = canAccessAdvancedDuty(ctx.auth)
				? await Promise.all([listDutyEvents(ctx), listDutyTemplates(ctx)])
				: [[], []];
			return { rosterHistory, advancedDutyTemplates, advancedDutyEvents };
		}
	});
};
