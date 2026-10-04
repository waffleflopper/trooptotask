import { describe, expect, it } from 'vitest';
import type { OrganizationMembershipFacts } from './memberAccessProjection';
import { getOrLoadRequestMembership, type MembershipRequestCache } from './requestMembershipCache.server';

describe('request membership reuse', () => {
	it('shares an in-flight lookup and its stored access within one account and Organization', async () => {
		const request: MembershipRequestCache = {};
		let resolve!: (membership: OrganizationMembershipFacts) => void;
		const pending = new Promise<OrganizationMembershipFacts>((resolvePromise) => {
			resolve = resolvePromise;
		});
		const first = getOrLoadRequestMembership(request, 'user-a', 'org-a', () => pending);
		const second = getOrLoadRequestMembership(request, 'user-a', 'org-a', async () => {
			throw new Error('An overlapping request must not issue another membership read');
		});
		resolve({
			id: 'member-a',
			role: 'member',
			member_preset: 'operator',
			access_scope_kind: 'groups',
			access_scope_group_ids: ['alpha', 'bravo']
		});
		const expected = {
			id: 'member-a',
			role: 'member',
			member_preset: 'operator',
			access_scope_kind: 'groups',
			access_scope_group_ids: ['alpha', 'bravo']
		};
		expect(await Promise.all([first, second])).toEqual([expected, expected]);
		await expect(
			getOrLoadRequestMembership(request, 'user-a', 'org-a', async () => {
				throw new Error('Completed membership must remain reusable within its request');
			})
		).resolves.toEqual(expected);
	});

	it('keeps other account and Organization lookups independent of a held lookup', async () => {
		const request: MembershipRequestCache = {};
		let release!: (membership: OrganizationMembershipFacts) => void;
		const first = getOrLoadRequestMembership(
			request,
			'user-a',
			'org-a',
			() =>
				new Promise((resolve) => {
					release = resolve;
				})
		);
		try {
			await expect(
				getOrLoadRequestMembership(request, 'user-b', 'org-a', async () => ({ id: 'peer', role: 'admin' }))
			).resolves.toEqual({ id: 'peer', role: 'admin' });
			await expect(
				getOrLoadRequestMembership(request, 'user-a', 'org-b', async () => ({ id: 'foreign', role: 'owner' }))
			).resolves.toEqual({ id: 'foreign', role: 'owner' });
		} finally {
			release({ id: 'held', role: 'member', member_preset: 'viewer' });
		}
		await expect(first).resolves.toEqual({ id: 'held', role: 'member', member_preset: 'viewer' });
	});

	it('does not reuse a completed membership in a later request after revocation', async () => {
		let membership: OrganizationMembershipFacts | null = { id: 'member-a', role: 'owner' };
		const load = async () => {
			if (!membership) throw new Error('Membership revoked');
			return membership;
		};
		await expect(getOrLoadRequestMembership({}, 'user-a', 'org-a', load)).resolves.toEqual({
			id: 'member-a',
			role: 'owner'
		});
		membership = null;
		await expect(getOrLoadRequestMembership({}, 'user-a', 'org-a', load)).rejects.toThrow('Membership revoked');
	});

	it('keeps a replacement membership when an older in-flight lookup fails', async () => {
		const cache = new Map<string, Promise<OrganizationMembershipFacts>>();
		const request: MembershipRequestCache = { membershipContextCache: cache };
		let reject!: (reason: Error) => void;
		const pending = new Promise<OrganizationMembershipFacts>((_resolve, rejectPromise) => {
			reject = rejectPromise;
		});
		const old = getOrLoadRequestMembership(request, 'user-a', 'org-a', () => pending);
		const observedFailure = expect(old).rejects.toThrow('old lookup failed');
		cache.clear();
		await getOrLoadRequestMembership(request, 'user-a', 'org-a', async () => ({
			role: 'member',
			member_preset: 'viewer',
			access_scope_kind: 'groups',
			access_scope_group_ids: ['bravo']
		}));
		reject(new Error('old lookup failed'));
		await observedFailure;
		await expect(
			getOrLoadRequestMembership(request, 'user-a', 'org-a', async () => {
				throw new Error('The replacement membership must remain available');
			})
		).resolves.toEqual({
			role: 'member',
			member_preset: 'viewer',
			access_scope_kind: 'groups',
			access_scope_group_ids: ['bravo']
		});
	});

	it('rejects all concurrent consumers of a failed lookup, then allows a fresh load', async () => {
		const request: MembershipRequestCache = {};
		let reject!: (reason: Error) => void;
		const pending = new Promise<OrganizationMembershipFacts>((_resolve, rejectPromise) => {
			reject = rejectPromise;
		});
		const first = getOrLoadRequestMembership(request, 'user-a', 'org-a', () => pending);
		const second = getOrLoadRequestMembership(request, 'user-a', 'org-a', async () => {
			throw new Error('Concurrent consumers must share the pending lookup');
		});
		const results = Promise.allSettled([first, second]);
		const failure = new Error('provider unavailable');
		reject(failure);
		expect(await results).toEqual([
			{ status: 'rejected', reason: failure },
			{ status: 'rejected', reason: failure }
		]);
		await expect(
			getOrLoadRequestMembership(request, 'user-a', 'org-a', async () => ({ role: 'admin' }))
		).resolves.toEqual({ role: 'admin' });
	});
});
