const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve only named targets already owned by this verification worker.
export function platformFormNetworkTarget(family, fixture, seed) {
	const contentActions = {
		'admin-announcements/create': ['/admin/announcements', 'create'],
		'admin-announcements/toggle': ['/admin/announcements', 'toggle'],
		'admin-announcements/delete': ['/admin/announcements', 'delete'],
		'admin-whats-new/save': ['/admin/announcements/whats-new', 'save'],
		'admin-whats-new/delete': ['/admin/announcements/whats-new', 'delete'],
		'admin-inbox/close': ['/admin', 'close'],
		'admin-inbox/resendSetup': ['/admin', 'resendSetup'],
		'admin-inbox/rescindAccess': ['/admin', 'rescindAccess'],
		'admin-inbox/askInviter': ['/admin', 'askInviter']
	};
	if (Object.hasOwn(contentActions, family)) {
		const [suffix, action] = contentActions[family];
		return { suffix, search: `?/${action}`, failureField: 'error', requestTarget: null, sameOrigin: true };
	}
	const contentReads = {
		'admin-inbox-read': '/admin/__data.json',
		'admin-inbox-item-read': '/admin/api/inbox/item',
		'admin-people-read': '/admin/people/__data.json',
		'admin-organizations-read': '/admin/organizations/__data.json',
		'admin-announcements-read': '/admin/announcements/__data.json',
		'admin-whats-new-read': '/admin/announcements/whats-new/__data.json'
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
			suffix: `/admin/${detail[1] === 'user' ? 'people' : 'organizations'}/${id}/__data.json`,
			search: null,
			failureField: null,
			requestTarget: null,
			sameOrigin: true
		};
	}
	const request = /^admin-(request-read|request)\/(approve|reject|completed)(?:\/(resendSetup|rescindAccess))?$/.exec(
		family
	);
	if (request && (request[1] === 'request-read') === (request[3] === undefined)) {
		if (!seed) throw new Error('Seed platform-admin first.');
		const id = seed.requests[request[2]]?.id;
		if (!uuid.test(id ?? '')) throw new Error('Use a recorded platform target.');
		return {
			suffix: `/admin/people/not-set-up/${id}${request[3] ? '' : '/__data.json'}`,
			search: request[3] ? `?/${request[3]}` : null,
			failureField: request[3] ? 'error' : null,
			requestTarget: null,
			sameOrigin: true
		};
	}
	const account = /^admin-account\/(orgCreator|orgInvitee|orgMember)\/resetPassword$/.exec(family);
	const access = /^admin-access\/(approve|reject|completed)\/(approve|reject)$/.exec(family);
	if (!account && !access) return null;
	if (!seed) throw new Error('Seed platform-admin first.');
	const id = account ? fixture.actors[account[1]]?.id : seed.requests[access[1]]?.id;
	if (!uuid.test(id ?? '')) throw new Error('Use a recorded platform target.');
	return {
		suffix: account ? `/admin/people/${id}` : '/admin',
		search: `?/${account ? 'resetPassword' : access[2]}`,
		failureField: 'error',
		sameOrigin: true,
		requestTarget: access ? { field: 'id', value: id } : null
	};
}
