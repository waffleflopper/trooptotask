import type { OrganizationMembershipFacts } from './memberAccessProjection';

export interface MembershipRequestCache {
	membershipContextCache?: Map<string, Promise<OrganizationMembershipFacts>>;
}

export function getOrLoadRequestMembership(
	request: MembershipRequestCache,
	userId: string | null | undefined,
	orgId: string,
	loadMembership: () => Promise<OrganizationMembershipFacts>
): Promise<OrganizationMembershipFacts> {
	const key = `${userId ?? 'anonymous'}:${orgId}`;
	const cached = request.membershipContextCache?.get(key);
	if (cached) return cached;

	const membershipPromise = Promise.resolve(loadMembership());
	const cache = (request.membershipContextCache ??= new Map());
	const trackedPromise = membershipPromise.catch((cause) => {
		if (cache.get(key) === trackedPromise) cache.delete(key);
		throw cause;
	});
	cache.set(key, trackedPromise);
	return trackedPromise;
}
