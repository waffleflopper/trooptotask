import { describe, expect, it, vi } from 'vitest';
import type { OrganizationOwnershipCandidateMembershipRow } from './organizationSettingsTypes';
import { loadOwnershipTransferCandidates } from './ownershipTransferSettings.server';

describe('ownership transfer settings', () => {
	it('reads only the current Organization and offers existing non-owner accounts', async () => {
		const listOwnershipCandidateMemberships = vi.fn(
			async (): Promise<OrganizationOwnershipCandidateMembershipRow[]> => [
				{ id: 'owner-membership', user_id: 'owner-user', email: 'owner@example.test', role: 'owner' },
				{ id: 'admin-membership', user_id: 'admin-user', email: 'admin@example.test', role: 'admin' },
				{ id: 'missing-email', user_id: 'existing-user', email: null, role: 'member' },
				{ id: 'pending-membership', user_id: null, email: 'pending@example.test', role: 'member' }
			]
		);

		const candidates = await loadOwnershipTransferCandidates({
			auth: { orgId: 'org-a', role: 'owner' },
			organizationSettings: { listOwnershipCandidateMemberships }
		});

		expect(candidates).toEqual([
			{ id: 'admin-membership', userId: 'admin-user', email: 'admin@example.test', membershipRole: 'admin' }
		]);
	});

	it('does not read candidates for a non-owner', async () => {
		const listOwnershipCandidateMemberships = vi.fn();
		const candidates = await loadOwnershipTransferCandidates({
			auth: { orgId: 'org-a', role: 'admin' },
			organizationSettings: { listOwnershipCandidateMemberships }
		});

		expect(candidates).toEqual([]);
		expect(listOwnershipCandidateMemberships).not.toHaveBeenCalled();
	});
});
