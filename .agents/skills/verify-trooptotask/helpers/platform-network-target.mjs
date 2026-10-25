const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve only named targets already owned by this verification worker.
export function platformFormNetworkTarget(family, fixture, seed) {
	const contentActions = {
		'admin-announcements/create': ['/admin/announcements', 'create'],
		'admin-announcements/toggle': ['/admin/announcements', 'toggle'],
		'admin-announcements/delete': ['/admin/announcements', 'delete'],
		'admin-inbox/close': ['/admin', 'close']
	};
	if (Object.hasOwn(contentActions, family)) {
		const [suffix, action] = contentActions[family];
		return { suffix, search: `?/${action}`, failureField: 'error', requestTarget: null, sameOrigin: true };
	}
	const contentReads = {
		'admin-audit-read': '/admin/audit/__data.json',
		'admin-inbox-read': '/admin/__data.json',
		'admin-inbox-item-read': '/admin/api/inbox/item',
		'admin-users-read': '/admin/users/__data.json',
		'admin-organizations-read': '/admin/organizations/__data.json',
		'admin-announcements-read': '/admin/announcements/__data.json'
	};
	if (Object.hasOwn(contentReads, family))
		return {
			suffix: contentReads[family],
			search: null,
			failureField: null,
			requestTarget: null,
			sameOrigin: true
		};
	const detail = /^admin-(user|organization)-detail-read$/.exec(family);
	if (detail) {
		if (!seed) throw new Error('Seed platform-admin first.');
		const id = detail[1] === 'user' ? fixture.actors.orgInvitee?.id : seed.organization?.id;
		if (!uuid.test(id ?? '')) throw new Error('Use a recorded platform target.');
		return {
			suffix: `/admin/${detail[1]}s/${id}/__data.json`,
			search: null,
			failureField: null,
			requestTarget: null,
			sameOrigin: true
		};
	}
	const account = /^admin-account\/(orgCreator|orgInvitee|orgMember|pendingUser)\/(resetPassword|resendInvite)$/.exec(
		family
	);
	const access = /^admin-access\/(approve|reject|completed)\/(approve|reject)$/.exec(family);
	if (!account && !access) return null;
	if (!seed) throw new Error('Seed platform-admin first.');
	const id = account
		? account[1] === 'pendingUser'
			? seed.pendingUser?.id
			: fixture.actors[account[1]]?.id
		: seed.requests[access[1]]?.id;
	if (!uuid.test(id ?? '')) throw new Error('Use a recorded platform target.');
	return {
		suffix: account ? `/admin/users/${id}` : '/admin',
		search: `?/${account ? account[2] : access[2]}`,
		failureField: 'error',
		sameOrigin: true,
		requestTarget: access ? { field: 'id', value: id } : null
	};
}
