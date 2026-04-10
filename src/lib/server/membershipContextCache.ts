import type { MembershipRow } from '$lib/server/permissionContext';

function getRequestMembershipKey(userId: string | null | undefined, orgId: string): string {
	return `${userId ?? 'anonymous'}:${orgId}`;
}

function getOrCreateRequestMembershipCache(locals: App.Locals): Map<string, Promise<MembershipRow>> {
	if (!locals.membershipContextCache) {
		locals.membershipContextCache = new Map();
	}

	return locals.membershipContextCache;
}

export function getCachedRequestMembership(
	locals: App.Locals,
	userId: string | null | undefined,
	orgId: string
): Promise<MembershipRow> | null {
	return locals.membershipContextCache?.get(getRequestMembershipKey(userId, orgId)) ?? null;
}

export function cacheRequestMembership(
	locals: App.Locals,
	userId: string | null | undefined,
	orgId: string,
	membership: MembershipRow | Promise<MembershipRow>
): Promise<MembershipRow> {
	const cache = getOrCreateRequestMembershipCache(locals);
	const key = getRequestMembershipKey(userId, orgId);
	const membershipPromise = Promise.resolve(membership);

	const trackedPromise = membershipPromise.catch((err) => {
		if (cache.get(key) === trackedPromise) {
			cache.delete(key);
		}

		throw err;
	});

	cache.set(key, trackedPromise);
	return trackedPromise;
}

export function getOrLoadRequestMembership(
	locals: App.Locals,
	userId: string | null | undefined,
	orgId: string,
	loadMembership: () => Promise<MembershipRow>
): Promise<MembershipRow> {
	const cachedMembership = getCachedRequestMembership(locals, userId, orgId);
	if (cachedMembership) {
		return cachedMembership;
	}

	return cacheRequestMembership(locals, userId, orgId, loadMembership());
}
