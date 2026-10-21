/** Posts one change to the unit's settings. A refusal throws the server's reason. */
export async function saveOrganizationSettings(orgUrlSegment: string, body: Record<string, unknown>): Promise<void> {
	const response = await fetch(`/org/${orgUrlSegment}/api/organization/settings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (response.ok) return;
	const failure: { message?: unknown } | null = await response.json().catch(() => null);
	throw new Error(typeof failure?.message === 'string' ? failure.message : 'Try again.');
}
