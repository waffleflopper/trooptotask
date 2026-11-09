import { describe, expect, it, vi } from 'vitest';
import type { OrganizationMemberLabelRow } from './memberLabels.server';
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

		const listMemberNames = vi.fn(
			async (): Promise<OrganizationMemberLabelRow[]> => [
				{
					user_id: 'admin-user',
					rank: 'SFC',
					first_name: 'Dana',
					last_name: 'Whitaker',
					email: 'admin@example.test',
					name_source: 'account'
				}
			]
		);

		const candidates = await loadOwnershipTransferCandidates({
			auth: { orgId: 'org-a', role: 'owner' },
			organizationSettings: { listOwnershipCandidateMemberships, listMemberNames }
		});

		expect(candidates).toEqual([
			{
				id: 'admin-membership',
				userId: 'admin-user',
				email: 'admin@example.test',
				name: 'SFC Dana Whitaker',
				membershipRole: 'admin'
			}
		]);
		expect(listOwnershipCandidateMemberships).toHaveBeenCalledExactlyOnceWith('org-a');
		expect(listMemberNames).toHaveBeenCalledExactlyOnceWith('org-a');
	});

	it('leaves a candidate without a name listed by email alone', async () => {
		const [candidate] = await loadOwnershipTransferCandidates({
			auth: { orgId: 'org-a', role: 'owner' },
			organizationSettings: {
				listOwnershipCandidateMemberships: async () => [
					{ id: 'm', user_id: 'u', email: 'plain@example.test', role: 'member' }
				],
				listMemberNames: async () => []
			}
		});

		expect(candidate).toMatchObject({ email: 'plain@example.test', name: null });
	});

	it('does not read candidates for a non-owner', async () => {
		const listOwnershipCandidateMemberships = vi.fn();
		const listMemberNames = vi.fn();
		const candidates = await loadOwnershipTransferCandidates({
			auth: { orgId: 'org-a', role: 'admin' },
			organizationSettings: { listOwnershipCandidateMemberships, listMemberNames }
		});

		expect(candidates).toEqual([]);
		expect(listOwnershipCandidateMemberships).not.toHaveBeenCalled();
		expect(listMemberNames).not.toHaveBeenCalled();
	});
});
