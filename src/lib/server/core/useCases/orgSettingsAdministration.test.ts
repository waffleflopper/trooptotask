import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	clearOrganizationUrlSlug,
	deleteOrganization,
	renameOrganization,
	transferOrganizationOwnership,
	updateOrganizationUrlSlug,
	type OrganizationSettingsAdministrationPort
} from './orgSettingsAdministration';

function createOrganizationSettingsAdministrationPort(
	options: {
		organizationName?: string | null;
		lookupOrganizationError?: string | null;
		renameOrganizationError?: string | null;
		updateOrganizationUrlSlugError?: string | null;
		transferOwnershipError?: string | null;
		deleteOrganizationError?: string | null;
		existingSlugOrgId?: string | null;
	} = {}
): OrganizationSettingsAdministrationPort & {
	renameRequests: Array<{ orgId: string; name: string }>;
	slugRequests: Array<{ orgId: string; urlSlug: string | null }>;
	transferRequests: Array<{ orgId: string; newOwnerId: string }>;
	slugLookups: string[];
	organizationLookups: string[];
	deletedOrganizations: string[];
} {
	const renameRequests: Array<{ orgId: string; name: string }> = [];
	const slugRequests: Array<{ orgId: string; urlSlug: string | null }> = [];
	const transferRequests: Array<{ orgId: string; newOwnerId: string }> = [];
	const slugLookups: string[] = [];
	const organizationLookups: string[] = [];
	const deletedOrganizations: string[] = [];

	return {
		renameRequests,
		slugRequests,
		transferRequests,
		slugLookups,
		organizationLookups,
		deletedOrganizations,
		async renameOrganization(orgId, name) {
			renameRequests.push({ orgId, name });
			return options.renameOrganizationError ?? null;
		},
		async updateOrganizationUrlSlug(orgId, urlSlug) {
			slugRequests.push({ orgId, urlSlug });
			return options.updateOrganizationUrlSlugError ?? null;
		},
		async findOrganizationByUrlSlug(urlSlug) {
			slugLookups.push(urlSlug);
			return options.existingSlugOrgId ? { id: options.existingSlugOrgId } : null;
		},
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

describe('renameOrganization', () => {
	it('denies high-access members who are not admin or owner before renaming organizations', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'member',
				requireManageMembers: vi.fn()
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		await expect(
			renameOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ name: 'Alpha Company' }
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});

		expect(port.renameRequests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.rename',
					reasonCode: 'denied:governance-role'
				},
				severity: 'warning'
			}
		]);
	});

	it('normalizes the organization name before persisting and auditing', async () => {
		const requireManageMembers = vi.fn();
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				requireManageMembers
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		const result = await renameOrganization(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
			{ name: '  Alpha   Company  ' }
		);

		expect(result).toEqual({ nameSuccess: true });
		expect(requireManageMembers).not.toHaveBeenCalled();
		expect(port.renameRequests).toEqual([{ orgId: 'org-1', name: 'Alpha Company' }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.renamed',
				resourceType: 'organization',
				details: { name: 'Alpha Company' }
			}
		]);
	});

	it('rejects empty organization names before provider work starts', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsAdministrationPort();

		await expect(
			renameOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ name: '   ' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Organization name is required'
		});

		expect(port.renameRequests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('preserves provider failures without auditing', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsAdministrationPort({
			renameOrganizationError: 'rename failed'
		});

		await expect(
			renameOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ name: 'Alpha Company' }
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'rename failed'
		});

		expect(ctx.auditPort.events).toEqual([]);
	});
});

describe('updateOrganizationUrlSlug', () => {
	it('normalizes, persists, and audits organization URL slugs', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		const result = await updateOrganizationUrlSlug(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
			{ urlSlug: '  1-11-BDE  ' }
		);

		expect(result).toEqual({ slugSuccess: true, orgUrlSlug: '1-11-bde' });
		expect(port.slugLookups).toEqual(['1-11-bde']);
		expect(port.slugRequests).toEqual([{ orgId: 'org-1', urlSlug: '1-11-bde' }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.url_slug_updated',
				resourceType: 'organization',
				details: { urlSlug: '1-11-bde' }
			}
		]);
	});

	it('rejects duplicate organization URL slugs before writing', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort({ existingSlugOrgId: 'org-2' });

		await expect(
			updateOrganizationUrlSlug(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ urlSlug: '1-11-bde' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Organization URL slug is already in use'
		});

		expect(port.slugRequests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('clears organization URL slugs through the same governance policy', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		const result = await clearOrganizationUrlSlug({
			auth: ctx.auth,
			audit: ctx.audit,
			notifications: ctx.notifications,
			administration: port
		});

		expect(result).toEqual({ slugSuccess: true, orgUrlSlug: null });
		expect(port.slugRequests).toEqual([{ orgId: 'org-1', urlSlug: null }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.url_slug_cleared',
				resourceType: 'organization'
			}
		]);
	});
});

describe('transferOrganizationOwnership', () => {
	it('denies admins before transferring ownership', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'admin',
				requireOwner: vi.fn()
			}
		});
		const port = createOrganizationSettingsAdministrationPort();

		await expect(
			transferOrganizationOwnership(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ newOwnerId: '11111111-1111-4111-8111-111111111111' }
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Only the organization owner can perform this action'
		});

		expect(port.transferRequests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.transferOwnership',
					reasonCode: 'denied:owner-only'
				},
				severity: 'warning'
			}
		]);
	});

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

		expect(requireOwner).not.toHaveBeenCalled();
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
	it('denies admins before deleting organizations', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'admin',
				requireOwner: vi.fn()
			}
		});
		const port = createOrganizationSettingsAdministrationPort({
			organizationName: 'Test Org'
		});

		await expect(
			deleteOrganization(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, administration: port },
				{ confirmName: 'Test Org' }
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Only the organization owner can perform this action'
		});

		expect(port.organizationLookups).toEqual([]);
		expect(port.deletedOrganizations).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.deleteOrganization',
					reasonCode: 'denied:owner-only'
				},
				severity: 'warning'
			}
		]);
	});

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
		expect(requireOwner).not.toHaveBeenCalled();
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
