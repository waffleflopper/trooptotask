// Ordinary same-origin requests from a normally signed-in owned page. Targets
// are resolved by control.mjs from this worker's recorded synthetic prerequisites.
export async function requestPlatform(target, { origin, family, targetId, body }) {
	if (target.location.origin !== origin) throw new Error('Use an owned app page');
	const fields = {
		suspend: ['type', 'action', 'reason'],
		invalidSuspension: ['case'],
		approve: [],
		reject: ['reason'],
		transferOwnership: ['targetUserId', 'confirmName'],
		resetPassword: [],
		resendInvite: [],
		announcementCreate: ['title', 'message', 'type', 'expiresAt'],
		announcementToggle: ['isActive'],
		announcementDelete: [],
		feedbackClose: []
	};
	if (!Object.hasOwn(fields, family)) throw new Error('Unsupported platform request');
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId))
		throw new Error('Use a recorded synthetic target UUID');
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Use a JSON object');
	for (const [key, value] of Object.entries(body)) {
		if (!fields[family].includes(key) || typeof value !== 'string') throw new Error('Unsupported platform field');
	}
	const access = ['approve', 'reject'].includes(family);
	const membership = family === 'transferOwnership';
	const json = family === 'suspend' || family === 'invalidSuspension';
	const contentActions = {
		announcementCreate: '/admin/announcements?/create',
		announcementToggle: '/admin/announcements?/toggle',
		announcementDelete: '/admin/announcements?/delete',
		feedbackClose: '/admin?/close'
	};
	const path = json
		? '/admin/api/suspend'
		: contentActions[family]
			? contentActions[family]
			: access
				? `/admin?/${family}`
				: membership
					? `/admin/organizations/${targetId}?/${family}`
					: `/admin/users/${targetId}?/${family}`;
	const invalidCases = {
		'null-body': null,
		'non-string-reason': { type: 'user', action: 'suspend', targetId, reason: 42 },
		'array-target': { type: 'user', action: 'suspend', targetId: [targetId] }
	};
	if (family === 'invalidSuspension' && !Object.hasOwn(invalidCases, body.case))
		throw new Error('Use a documented malformed suspension case');
	const submitted =
		family === 'invalidSuspension'
			? invalidCases[body.case]
			: json
				? { ...body, targetId }
				: access
					? { ...body, id: targetId }
					: ['announcementToggle', 'announcementDelete'].includes(family)
						? { ...body, id: targetId }
						: family === 'feedbackClose'
							? { ...body, id: targetId }
							: body;
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
