import { describe, expect, it, vi } from 'vitest';
import { loadOwnershipTransferCandidates } from './ownershipTransferSettings.server';

describe('ownership transfer settings', () => {
	it('reads only the current Organization and offers existing non-owner accounts', async () => {
		const findMany = vi.fn(async () => [
			{ id: 'owner-membership', user_id: 'owner-user', email: 'owner@example.test', role: 'owner' },
			{ id: 'admin-membership', user_id: 'admin-user', email: 'admin@example.test', role: 'admin' },
			{ id: 'missing-email', user_id: 'existing-user', email: null, role: 'member' },
			{ id: 'pending-membership', user_id: null, email: 'pending@example.test', role: 'member' }
		]);

		const candidates = await loadOwnershipTransferCandidates({
			auth: { orgId: 'org-a', role: 'owner' },
			store: { findMany }
		} as never);

		expect(findMany).toHaveBeenCalledOnce();
		expect(findMany).toHaveBeenCalledWith('organization_memberships', 'org-a', undefined, {
			select: 'id, user_id, email, role'
		});
		expect(candidates).toEqual([
			{ id: 'admin-membership', userId: 'admin-user', email: 'admin@example.test', membershipRole: 'admin' }
		]);
	});

	it('does not read candidates for a non-owner', async () => {
		const findMany = vi.fn();
		const candidates = await loadOwnershipTransferCandidates({
			auth: { orgId: 'org-a', role: 'admin' },
			store: { findMany }
		} as never);

		expect(candidates).toEqual([]);
		expect(findMany).not.toHaveBeenCalled();
	});
});
