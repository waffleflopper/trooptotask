import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { readSetupTeam } from './teamLoad.server';

function fixture(role: 'owner' | 'admin' | 'member') {
	const base = createTestContext({ auth: { role } });
	const listInvitations = vi.fn(async () => []);
	const ctx = {
		auth: base.auth,
		disabledFeatures: [],
		groups: {
			listCatalog: async () => [{ id: 'g-1', name: 'HQ PLT', sortOrder: 0, parentId: null, depth: 1 }],
			countActiveMembers: async () => new Map([['g-1', 4]])
		},
		organizationSettings: {
			listMemberAccess: vi.fn(async () => []),
			listInvitations,
			listInvitationDeliveries: async () => []
		}
	} as unknown as Parameters<typeof readSetupTeam>[0];
	return { ctx, listInvitations };
}

describe('readSetupTeam', () => {
	it('gives an owner the form data, the groups and the pending invitations', async () => {
		const { ctx } = fixture('owner');

		expect(await readSetupTeam(ctx)).toEqual({
			canInvite: true,
			isOwner: true,
			groups: [{ id: 'g-1', name: 'HQ PLT', parentId: null, memberCount: 4 }],
			invitations: []
		});
	});

	it('lets an admin invite without owner authority', async () => {
		const { ctx } = fixture('admin');

		expect(await readSetupTeam(ctx)).toMatchObject({ canInvite: true, isOwner: false });
	});

	it('reads nothing for a viewer without the invite action', async () => {
		const { ctx, listInvitations } = fixture('member');

		expect(await readSetupTeam(ctx)).toEqual({ canInvite: false, isOwner: false, groups: [], invitations: [] });
		expect(listInvitations).not.toHaveBeenCalled();
	});

	it('does not read the member roster or closed invitations', async () => {
		const { ctx, listInvitations } = fixture('owner');

		await readSetupTeam(ctx);

		expect(ctx.organizationSettings.listMemberAccess).not.toHaveBeenCalled();
		expect(listInvitations).toHaveBeenCalledTimes(1);
		expect(listInvitations).toHaveBeenCalledWith(ctx.auth.orgId, 'pending');
	});
});
