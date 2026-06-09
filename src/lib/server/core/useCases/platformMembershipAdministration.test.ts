import { describe, expect, it, vi } from 'vitest';
import { createInMemoryPlatformMembershipAdministrationStore } from '$lib/server/adapters/inMemoryPlatformMembershipAdministration';
import {
	createPlatformMembershipAdministration,
	type PlatformMembershipAdministrationStore
} from './platformMembershipAdministration';

describe('PlatformMembershipAdministration', () => {
	it('makes an organization member an admin through the public interface', async () => {
		const audit = vi.fn();
		const store = createInMemoryPlatformMembershipAdministrationStore({
			organizations: [{ id: 'org-1', name: 'Able Company' }],
			memberships: [
				{ orgId: 'org-1', userId: 'owner-1', role: 'owner' },
				{ orgId: 'org-1', userId: 'member-1', role: 'member' }
			]
		});
		const admin = createPlatformMembershipAdministration({ store, audit });

		await expect(admin.makeAdmin({ orgId: 'org-1', targetUserId: 'member-1' })).resolves.toEqual({
			status: 'updated',
			orgId: 'org-1',
			targetUserId: 'member-1'
		});

		await expect(store.getMembership({ orgId: 'org-1', userId: 'member-1' })).resolves.toMatchObject({
			role: 'admin'
		});
		expect(audit).toHaveBeenCalledWith({
			action: 'admin.org.make_admin',
			resourceType: 'organization',
			resourceId: 'org-1',
			orgId: 'org-1',
			details: { targetUserId: 'member-1', previousRole: 'member' },
			severity: 'warning'
		});
	});

	it('does not audit make-admin when the store command fails', async () => {
		const audit = vi.fn();
		const store = createInMemoryPlatformMembershipAdministrationStore({
			setRoleError: new Error('database unavailable'),
			organizations: [{ id: 'org-1', name: 'Able Company' }],
			memberships: [
				{ orgId: 'org-1', userId: 'owner-1', role: 'owner' },
				{ orgId: 'org-1', userId: 'member-1', role: 'member' }
			]
		});
		const admin = createPlatformMembershipAdministration({ store, audit });

		await expect(admin.makeAdmin({ orgId: 'org-1', targetUserId: 'member-1' })).rejects.toThrow('database unavailable');

		await expect(store.getMembership({ orgId: 'org-1', userId: 'member-1' })).resolves.toMatchObject({
			role: 'member'
		});
		expect(audit).not.toHaveBeenCalled();
	});

	it('does not audit make-admin when the target membership disappears before the role update', async () => {
		const audit = vi.fn();
		const updateStore = createInMemoryPlatformMembershipAdministrationStore({
			organizations: [{ id: 'org-1', name: 'Able Company' }]
		});
		const store: PlatformMembershipAdministrationStore = {
			...updateStore,
			async getMembership(input) {
				if (input.orgId === 'org-1' && input.userId === 'member-1') {
					return { orgId: 'org-1', userId: 'member-1', role: 'member' };
				}
				return null;
			}
		};
		const admin = createPlatformMembershipAdministration({ store, audit });

		await expect(admin.makeAdmin({ orgId: 'org-1', targetUserId: 'member-1' })).rejects.toThrow(
			'membership not found for role update'
		);

		expect(audit).not.toHaveBeenCalled();
	});

	it('transfers organization ownership while preserving a single owner', async () => {
		const audit = vi.fn();
		const store = createInMemoryPlatformMembershipAdministrationStore({
			organizations: [{ id: 'org-1', name: 'Able Company' }],
			memberships: [
				{ orgId: 'org-1', userId: 'owner-1', role: 'owner' },
				{ orgId: 'org-1', userId: 'member-1', role: 'member' }
			]
		});
		const admin = createPlatformMembershipAdministration({ store, audit });

		await expect(
			admin.transferOwnership({ orgId: 'org-1', targetUserId: 'member-1', confirmName: 'Able Company' })
		).resolves.toEqual({
			status: 'updated',
			orgId: 'org-1',
			fromUserId: 'owner-1',
			toUserId: 'member-1'
		});

		await expect(store.getMembership({ orgId: 'org-1', userId: 'owner-1' })).resolves.toMatchObject({
			role: 'admin'
		});
		await expect(store.getMembership({ orgId: 'org-1', userId: 'member-1' })).resolves.toMatchObject({
			role: 'owner'
		});
		expect(audit).toHaveBeenCalledWith({
			action: 'transfer_org_ownership',
			resourceType: 'organization',
			resourceId: 'org-1',
			orgId: 'org-1',
			details: {
				fromUserId: 'owner-1',
				toUserId: 'member-1',
				orgName: 'Able Company'
			},
			severity: 'critical'
		});
	});

	it('restores the original owner when promotion fails during ownership transfer', async () => {
		const audit = vi.fn();
		const baseStore = createInMemoryPlatformMembershipAdministrationStore({
			organizations: [{ id: 'org-1', name: 'Able Company' }],
			memberships: [
				{ orgId: 'org-1', userId: 'owner-1', role: 'owner' },
				{ orgId: 'org-1', userId: 'member-1', role: 'member' }
			]
		});
		const store: PlatformMembershipAdministrationStore = {
			...baseStore,
			setMembershipRole: vi.fn(async (input) => {
				if (input.userId === 'member-1' && input.role === 'owner') {
					throw new Error('promotion failed');
				}
				await baseStore.setMembershipRole(input);
			})
		};
		const admin = createPlatformMembershipAdministration({ store, audit });

		await expect(
			admin.transferOwnership({ orgId: 'org-1', targetUserId: 'member-1', confirmName: 'Able Company' })
		).resolves.toEqual({ status: 'promotion_failed' });

		await expect(baseStore.getMembership({ orgId: 'org-1', userId: 'owner-1' })).resolves.toMatchObject({
			role: 'owner'
		});
		await expect(baseStore.getMembership({ orgId: 'org-1', userId: 'member-1' })).resolves.toMatchObject({
			role: 'member'
		});
		expect(audit).not.toHaveBeenCalled();
		expect(store.setMembershipRole).toHaveBeenCalledWith({ orgId: 'org-1', userId: 'owner-1', role: 'owner' });
	});

	it('reports when a failed promotion cannot restore the original owner', async () => {
		const audit = vi.fn();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const baseStore = createInMemoryPlatformMembershipAdministrationStore({
			organizations: [{ id: 'org-1', name: 'Able Company' }],
			memberships: [
				{ orgId: 'org-1', userId: 'owner-1', role: 'owner' },
				{ orgId: 'org-1', userId: 'member-1', role: 'member' }
			]
		});
		const store: PlatformMembershipAdministrationStore = {
			...baseStore,
			setMembershipRole: vi.fn(async (input) => {
				if (input.userId === 'member-1' && input.role === 'owner') {
					throw new Error('promotion failed');
				}
				if (input.userId === 'owner-1' && input.role === 'owner') {
					throw new Error('rollback failed');
				}
				await baseStore.setMembershipRole(input);
			})
		};
		const admin = createPlatformMembershipAdministration({ store, audit });

		await expect(
			admin.transferOwnership({ orgId: 'org-1', targetUserId: 'member-1', confirmName: 'Able Company' })
		).resolves.toEqual({ status: 'rollback_failed' });

		await expect(baseStore.getMembership({ orgId: 'org-1', userId: 'owner-1' })).resolves.toMatchObject({
			role: 'admin'
		});
		await expect(baseStore.getMembership({ orgId: 'org-1', userId: 'member-1' })).resolves.toMatchObject({
			role: 'member'
		});
		expect(audit).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining('Platform ownership transfer rollback failed'),
			expect.objectContaining({
				orgId: 'org-1',
				currentOwnerUserId: 'owner-1',
				targetUserId: 'member-1'
			})
		);
		consoleError.mockRestore();
	});

	it('stops ownership transfer before role changes when no current owner exists', async () => {
		const audit = vi.fn();
		const store = createInMemoryPlatformMembershipAdministrationStore({
			organizations: [{ id: 'org-1', name: 'Able Company' }],
			memberships: [{ orgId: 'org-1', userId: 'member-1', role: 'member' }]
		});
		const admin = createPlatformMembershipAdministration({ store, audit });

		await expect(
			admin.transferOwnership({ orgId: 'org-1', targetUserId: 'member-1', confirmName: 'Able Company' })
		).resolves.toEqual({ status: 'no_current_owner' });

		await expect(store.getMembership({ orgId: 'org-1', userId: 'member-1' })).resolves.toMatchObject({
			role: 'member'
		});
		expect(audit).not.toHaveBeenCalled();
	});
});
