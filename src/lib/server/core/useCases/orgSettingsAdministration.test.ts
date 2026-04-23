import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	deleteOrganization,
	transferOrganizationOwnership,
	type OrganizationSettingsAdministrationPort
} from './orgSettingsAdministration';

function createOrganizationSettingsAdministrationPort(
	options: {
		organizationName?: string | null;
		lookupOrganizationError?: string | null;
		transferOwnershipError?: string | null;
		deleteOrganizationError?: string | null;
	} = {}
): OrganizationSettingsAdministrationPort & {
	transferRequests: Array<{ orgId: string; newOwnerId: string }>;
	organizationLookups: string[];
	deletedOrganizations: string[];
} {
	const transferRequests: Array<{ orgId: string; newOwnerId: string }> = [];
	const organizationLookups: string[] = [];
	const deletedOrganizations: string[] = [];

	return {
		transferRequests,
		organizationLookups,
		deletedOrganizations,
		async transferOwnership(orgId, newOwnerId) {
			transferRequests.push({ orgId, newOwnerId });
			return options.transferOwnershipError ?? null;
		},
		async lookupOrganization(orgId) {
			organizationLookups.push(orgId);
			return {
				name: options.organizationName ?? null,
				errorMessage: options.lookupOrganizationError ?? null
			};
		},
		async deleteOrganization(orgId) {
			deletedOrganizations.push(orgId);
			return options.deleteOrganizationError ?? null;
		}
	};
}

describe('transferOrganizationOwnership', () => {
	it('rejects invalid target user ids before transfer provider work starts', async () => {
		const requireOwner = vi.fn();
		const ctx = createTestContext({
			auth: {
				requireOwner
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		await expect(
			transferOrganizationOwnership(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ newOwnerId: 'bad-id' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Invalid user ID'
		});

		expect(requireOwner).toHaveBeenCalled();
		expect(port.transferRequests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('transfers ownership through the administration boundary, audits it, and notifies the new owner', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Alpha Company'
		});

		const result = await transferOrganizationOwnership(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
			{ newOwnerId: '11111111-1111-4111-8111-111111111111' }
		);

		expect(result).toEqual({ transferSuccess: true });
		expect(port.transferRequests).toEqual([
			{
				orgId: 'org-1',
				newOwnerId: '11111111-1111-4111-8111-111111111111'
			}
		]);
		expect(port.organizationLookups).toEqual(['org-1']);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.ownership_transferred',
				resourceType: 'organization',
				details: { newOwnerId: '11111111-1111-4111-8111-111111111111' },
				severity: 'critical'
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'user',
				orgId: 'org-1',
				userId: '11111111-1111-4111-8111-111111111111',
				notification: {
					type: 'ownership_transferred',
					title: 'Ownership Transferred',
					message: 'You are now the owner of "Alpha Company".',
					link: '/org/org-1/settings'
				}
			}
		]);
	});

	it('preserves transfer provider failures without auditing or notifying', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsAdministrationPort({
			transferOwnershipError: 'transfer failed'
		});

		await expect(
			transferOrganizationOwnership(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ newOwnerId: '11111111-1111-4111-8111-111111111111' }
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'transfer failed'
		});

		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('preserves the current fallback notification copy when the organization name lookup fails after transfer', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			lookupOrganizationError: 'lookup failed',
			organizationName: null
		});

		const result = await transferOrganizationOwnership(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
			{ newOwnerId: '11111111-1111-4111-8111-111111111111' }
		);

		expect(result).toEqual({ transferSuccess: true });
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'user',
				orgId: 'org-1',
				userId: '11111111-1111-4111-8111-111111111111',
				notification: {
					type: 'ownership_transferred',
					title: 'Ownership Transferred',
					message: 'You are now the owner of "the organization".',
					link: '/org/org-1/settings'
				}
			}
		]);
	});
});

describe('deleteOrganization', () => {
	it('normalizes the confirmation name before deleting and records the destructive audit event', async () => {
		const requireOwner = vi.fn();
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				requireOwner
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Test   Org'
		});

		const result = await deleteOrganization(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
			{ confirmName: '  Test Org  ' }
		);

		expect(result).toEqual({ success: true });
		expect(requireOwner).toHaveBeenCalled();
		expect(port.organizationLookups).toEqual(['org-1']);
		expect(port.deletedOrganizations).toEqual(['org-1']);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.deleted',
				resourceType: 'organization',
				severity: 'critical'
			}
		]);
	});

	it('returns the current mismatch failure without deleting the organization', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Test Org'
		});

		await expect(
			deleteOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ confirmName: 'Other Org' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Organization name does not match'
		});

		expect(port.deletedOrganizations).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('preserves organization lookup failures before the destructive step', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsAdministrationPort({
			lookupOrganizationError: 'lookup failed'
		});

		await expect(
			deleteOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ confirmName: 'Test Org' }
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'lookup failed'
		});

		expect(port.deletedOrganizations).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('preserves delete provider failures without emitting the destructive audit event', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Test Org',
			deleteOrganizationError: 'delete failed'
		});

		await expect(
			deleteOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ confirmName: 'Test Org' }
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'delete failed'
		});

		expect(port.deletedOrganizations).toEqual(['org-1']);
		expect(ctx.auditPort.events).toEqual([]);
	});
});
