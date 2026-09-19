import { describe, expect, it } from 'vitest';
import { cacheRequestMembership, getOrLoadRequestMembership } from './membershipContextCache';
import type { MembershipRow } from './permissionContext';

describe('request membership cache failure races', () => {
	it('keeps a replacement grant when an older in-flight lookup fails', async () => {
		const locals = {} as App.Locals;
		let reject!: (reason: Error) => void;
		const pending = new Promise<MembershipRow>((_resolve, rejectPromise) => {
			reject = rejectPromise;
		});
		const old = cacheRequestMembership(locals, 'user-a', 'org-a', pending);
		const observedFailure = expect(old).rejects.toThrow('old lookup failed');
		const current: MembershipRow = {
			role: 'member',
			member_preset: 'viewer',
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-b']
		};
		await cacheRequestMembership(locals, 'user-a', 'org-a', current);
		reject(new Error('old lookup failed'));
		await observedFailure;
		const result = await getOrLoadRequestMembership(locals, 'user-a', 'org-a', async () => {
			throw new Error('The replacement membership must remain available');
		});
		expect(result).toEqual(current);
	});

	it('rejects all concurrent consumers of a failed lookup, then allows a fresh load', async () => {
		const locals = {} as App.Locals;
		let reject!: (reason: Error) => void;
		const pending = new Promise<MembershipRow>((_resolve, rejectPromise) => {
			reject = rejectPromise;
		});
		const first = getOrLoadRequestMembership(locals, 'user-a', 'org-a', () => pending);
		const second = getOrLoadRequestMembership(locals, 'user-a', 'org-a', async () => {
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
			getOrLoadRequestMembership(locals, 'user-a', 'org-a', async () => ({ role: 'admin' }))
		).resolves.toEqual({ role: 'admin' });
	});
});
