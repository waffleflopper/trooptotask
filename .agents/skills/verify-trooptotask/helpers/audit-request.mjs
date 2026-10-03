// A bounded ordinary authenticated PUT, distinct from native Training editor proof.
export async function requestAuditTrainingUpdate(target, { origin, orgId, body }) {
	if (target.location.origin !== origin) throw new Error('Use an owned app page');
	if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(orgId))
		throw new Error('Use a synthetic Organization UUID');
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Use a JSON object');
	for (const [key, value] of Object.entries(body)) {
		if (
			!['id', 'notes', 'completionDate', 'expirationDate'].includes(key) ||
			(value !== null && typeof value !== 'string')
		)
			throw new Error('Use allowlisted scalar Training fields');
	}
	if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.id))
		throw new Error('Use a saved synthetic Training UUID');
	const path = `/org/${orgId}/api/personnel-trainings`;
	const response = await target.fetch(path, {
		method: 'PUT',
		redirect: 'manual',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	return { request: { method: 'PUT', path, submitted: body }, status: response.status, body: await response.text() };
}
