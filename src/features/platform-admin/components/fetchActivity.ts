import { activitySearchParams, type ActivityPage, type ActivityQuery } from '../activityQuery';

export async function fetchActivity(
	query: ActivityQuery,
	timeZone: string,
	signal: AbortSignal
): Promise<ActivityPage> {
	const params = activitySearchParams(query);
	params.set('tz', timeZone);
	const response = await fetch(`/admin/api/activity?${params}`, { signal });
	if (!response.ok) throw new Error('Activity could not be loaded');
	return response.json();
}
