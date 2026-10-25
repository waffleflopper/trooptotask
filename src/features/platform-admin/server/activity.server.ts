import type { PlatformAudit } from '$lib/audit/contracts';
import { activityInstantRange, ACTIVITY_PAGE_SIZE, type ActivityPage, type ActivityQuery } from '../activityQuery';
import { activityScope } from '../auditSentences';

/** One database read for one page of platform events in the chosen filter, search and day range. */
export async function listPlatformActivity(
	audit: Pick<PlatformAudit, 'listActivity'>,
	query: ActivityQuery,
	timeZone: string
): Promise<ActivityPage> {
	const { from, to } = activityInstantRange(query, timeZone);
	const result = await audit.listActivity({
		...activityScope(query.category),
		search: query.q,
		from,
		to,
		page: query.page,
		limit: ACTIVITY_PAGE_SIZE
	});
	return { events: result.events, page: result.page, pageSize: result.limit, totalCount: result.totalCount };
}
