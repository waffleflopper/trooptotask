import { buildRequestError } from '$lib/stores/core';

/** Records that the person's end-of-tour award has been started. */
export async function acknowledgeAwardTracking(orgId: string, personnelId: string): Promise<void> {
	const response = await fetch(`/org/${orgId}/api/personnel/${personnelId}/award-tracking`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ acknowledged: true })
	});
	if (!response.ok) throw await buildRequestError(response, 'POST', 'award tracking');
}
