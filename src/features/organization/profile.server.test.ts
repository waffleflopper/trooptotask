import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	clearOrganizationUrlSlug,
	renameOrganization,
	updateOrganizationUrlSlug,
	type OrganizationProfilePort
} from './profile.server';

function createOrganizationProfilePort(
	options: {
		renameOrganizationError?: string | null;
		updateOrganizationUrlSlugError?: string | null;
		existingSlugOrgId?: string | null;
	} = {}
): OrganizationProfilePort & {
	renameRequests: Array<{ orgId: string; name: string }>;
	slugRequests: Array<{ orgId: string; urlSlug: string | null }>;
	slugLookups: string[];
} {
	const renameRequests: Array<{ orgId: string; name: string }> = [];
	const slugRequests: Array<{ orgId: string; urlSlug: string | null }> = [];
	const slugLookups: string[] = [];

	return {
		renameRequests,
		slugRequests,
		slugLookups,
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
		}
	};
}

describe('renameOrganization', () => {
	it('denies high-access members who are not admin or owner before renaming organizations', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'member'
			}
		});
		const port = createOrganizationProfilePort();

		await expect(
			renameOrganization({ auth: ctx.auth, audit: ctx.audit, administration: port }, { name: 'Alpha Company' })
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
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationProfilePort();

		const result = await renameOrganization(
			{ auth: ctx.auth, audit: ctx.audit, administration: port },
			{ name: '  Alpha   Company  ' }
		);

		expect(result).toEqual({ nameSuccess: true });
		expect(port.renameRequests).toEqual([{ orgId: 'org-1', name: 'Alpha Company' }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'org.renamed',
				resourceType: 'organization',
				details: { name: 'Alpha Company' }
			}
		]);
	});

	it('caps normalized Organization names at the retained 100-character limit', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		const port = createOrganizationProfilePort();
		await renameOrganization({ auth: ctx.auth, audit: ctx.audit, administration: port }, { name: 'X'.repeat(101) });
		expect(port.renameRequests).toEqual([{ orgId: 'org-1', name: 'X'.repeat(100) }]);
		expect(ctx.auditPort.events).toMatchObject([{ details: { name: 'X'.repeat(100) } }]);
	});

	it('rejects empty organization names before provider work starts', async () => {
		const ctx = createTestContext();
		const port = createOrganizationProfilePort();

		await expect(
			renameOrganization({ auth: ctx.auth, audit: ctx.audit, administration: port }, { name: '   ' })
		).rejects.toMatchObject({
			status: 400,
			message: 'Organization name is required'
		});

		expect(port.renameRequests).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('preserves provider failures without auditing', async () => {
		const ctx = createTestContext();
		const port = createOrganizationProfilePort({
			renameOrganizationError: 'rename failed'
		});

		await expect(
			renameOrganization({ auth: ctx.auth, audit: ctx.audit, administration: port }, { name: 'Alpha Company' })
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
		const port = createOrganizationProfilePort();

		const result = await updateOrganizationUrlSlug(
			{ auth: ctx.auth, audit: ctx.audit, administration: port },
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
		const port = createOrganizationProfilePort({ existingSlugOrgId: 'org-2' });

		await expect(
			updateOrganizationUrlSlug({ auth: ctx.auth, audit: ctx.audit, administration: port }, { urlSlug: '1-11-bde' })
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
		const port = createOrganizationProfilePort();

		const result = await clearOrganizationUrlSlug({
			auth: ctx.auth,
			audit: ctx.audit,
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
