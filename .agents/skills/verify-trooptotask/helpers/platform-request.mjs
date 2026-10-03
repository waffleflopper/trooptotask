// Ordinary same-origin requests from a normally signed-in owned page. Targets
// are resolved by control.mjs from this worker's recorded synthetic prerequisites.
export async function requestPlatform(target, { origin, family, targetId, body }) {
	if (target.location.origin !== origin) throw new Error('Use an owned app page');
	const fields = {
		suspend: ['type', 'action', 'reason'],
		approve: [],
		reject: [],
		resend: [],
		makeAdmin: ['targetUserId'],
		transferOwnership: ['targetUserId', 'confirmName'],
		resetPassword: [],
		resendInvite: []
	};
	if (!Object.hasOwn(fields, family)) throw new Error('Unsupported platform request');
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId))
		throw new Error('Use a recorded synthetic target UUID');
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Use a JSON object');
	for (const [key, value] of Object.entries(body)) {
		if (!fields[family].includes(key) || typeof value !== 'string') throw new Error('Unsupported platform field');
	}
	const access = ['approve', 'reject', 'resend'].includes(family);
	const membership = ['makeAdmin', 'transferOwnership'].includes(family);
	const json = family === 'suspend';
	const path = json
		? '/admin/api/suspend'
		: access
			? `/admin/access-requests?/${family}`
			: membership
				? `/admin/organizations/${targetId}?/${family}`
				: `/admin/users/${targetId}?/${family}`;
	const submitted = json ? { ...body, targetId } : access ? { requestId: targetId } : body;
	const response = await target.fetch(path, {
		method: 'POST',
		redirect: 'manual',
		headers: json
			? { 'Content-Type': 'application/json' }
			: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'x-sveltekit-action': 'true',
					Accept: 'application/json'
				},
		body: json ? JSON.stringify(submitted) : new URLSearchParams(submitted).toString()
	});
	return { request: { method: 'POST', path, submitted }, status: response.status, body: await response.text() };
}
