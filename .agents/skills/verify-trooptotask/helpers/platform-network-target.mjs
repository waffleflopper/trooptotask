const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve only named targets already owned by this verification worker.
export function platformFormNetworkTarget(family, fixture, seed) {
	const account = /^admin-account\/(orgCreator|orgInvitee|orgMember)\/(resetPassword|resendInvite)$/.exec(family);
	const access = /^admin-access\/(approve|reject|completed)\/(approve|reject|resend)$/.exec(family);
	if (!account && !access) return null;
	if (!seed) throw new Error('Seed platform-admin first.');
	const id = account ? fixture.actors[account[1]]?.id : seed.requests[access[1]]?.id;
	if (!uuid.test(id ?? '')) throw new Error('Use a recorded platform target.');
	return {
		suffix: account ? `/admin/users/${id}` : '/admin/access-requests',
		search: `?/${account ? account[2] : access[2]}`,
		failureField: 'error',
		sameOrigin: true,
		requestTarget: access ? { field: 'requestId', value: id } : null
	};
}
