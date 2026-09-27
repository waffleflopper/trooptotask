import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	provisionOrganization,
	type OrgProvisioningAssignmentTypeSeed,
	type OrgProvisioningPort
} from './orgProvisioning';

function createOrgProvisioningPort(
	options: {
		createResult?: { orgId: string | null; errorMessage: string | null };
		rankCatalogError?: string | null;
	} = {}
): OrgProvisioningPort & {
	createRequests: string[];
	ownerEmailUpdates: Array<{ organizationId: string; userId: string; email: string | undefined }>;
	groupSeeds: string[];
	statusTypeSeeds: string[];
	assignmentTypeSeeds: Array<{ organizationId: string; assignmentTypes: OrgProvisioningAssignmentTypeSeed[] }>;
	federalHolidaySeeds: string[];
	rankCatalogSeeds: string[];
} {
	const createRequests: string[] = [];
	const ownerEmailUpdates: Array<{ organizationId: string; userId: string; email: string | undefined }> = [];
	const groupSeeds: string[] = [];
	const statusTypeSeeds: string[] = [];
	const assignmentTypeSeeds: Array<{ organizationId: string; assignmentTypes: OrgProvisioningAssignmentTypeSeed[] }> =
		[];
	const federalHolidaySeeds: string[] = [];
	const rankCatalogSeeds: string[] = [];

	return {
		createRequests,
		ownerEmailUpdates,
		groupSeeds,
		statusTypeSeeds,
		assignmentTypeSeeds,
		federalHolidaySeeds,
		rankCatalogSeeds,
		async createOrganizationWithOwner(name) {
			createRequests.push(name);
			return options.createResult ?? { orgId: 'org-1', errorMessage: null };
		},
		async updateOwnerMembershipEmail(input) {
			ownerEmailUpdates.push(input);
			return null;
		},
		async seedDefaultGroups(organizationId) {
			groupSeeds.push(organizationId);
			return null;
		},
		async seedDefaultStatusTypes(organizationId) {
			statusTypeSeeds.push(organizationId);
			return null;
		},
		async seedDefaultAssignmentTypes(organizationId, assignmentTypes) {
			assignmentTypeSeeds.push({ organizationId, assignmentTypes });
			return null;
		},
		async seedFederalHolidays(organizationId) {
			federalHolidaySeeds.push(organizationId);
			return null;
		},
		async seedDefaultRankCatalog(organizationId) {
			rankCatalogSeeds.push(organizationId);
			return options.rankCatalogError ?? null;
		}
	};
}

describe('provisionOrganization', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('creates retained defaults for the new Organization with independent calendar and rank examples', async () => {
		const port = createOrgProvisioningPort();
		const result = await provisionOrganization(port, {
			name: '  Alpha   Company  ',
			userId: 'user-1',
			email: 'OWNER@EXAMPLE.COM'
		});

		expect(result).toEqual({ orgId: 'org-1' });
		expect(port.createRequests).toEqual(['Alpha Company']);
		expect(port.ownerEmailUpdates).toEqual([
			{
				organizationId: 'org-1',
				userId: 'user-1',
				email: 'owner@example.com'
			}
		]);
		expect(port.groupSeeds).toEqual(['org-1']);
		expect(port.statusTypeSeeds).toEqual(['org-1']);
		expect(port.assignmentTypeSeeds).toEqual([
			{
				organizationId: 'org-1',
				assignmentTypes: [
					{
						name: 'Staff Duty',
						shortName: 'SD',
						assignTo: 'personnel',
						color: '#dc2626',
						sortOrder: 0
					}
				]
			}
		]);
		expect(port.federalHolidaySeeds).toEqual(['org-1']);
		expect(port.rankCatalogSeeds).toEqual(['org-1']);
	});

	it('collapses repeated internal whitespace before creating the organization', async () => {
		const port = createOrgProvisioningPort();

		await provisionOrganization(port, {
			name: '  1st   Platoon    HQ  ',
			userId: 'user-1',
			email: 'owner@example.com'
		});

		expect(port.createRequests).toEqual(['1st Platoon HQ']);
	});

	it('accepts a name at the 100-character boundary without data loss', async () => {
		const port = createOrgProvisioningPort();
		const name = 'A'.repeat(100);
		await provisionOrganization(port, { name, userId: 'user-1' });
		expect(port.createRequests).toEqual([name]);
	});

	it('rejects blank organization names before any provider work starts', async () => {
		const port = createOrgProvisioningPort();

		await expect(
			provisionOrganization(port, {
				name: '   ',
				userId: 'user-1',
				email: 'owner@example.com'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Organization name is required'
		});

		expect(port.createRequests).toEqual([]);
	});

	it('fails the request when organization creation itself fails', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const port = createOrgProvisioningPort({
			createResult: {
				orgId: null,
				errorMessage: 'Failed to create organization'
			}
		});

		await expect(
			provisionOrganization(port, {
				name: 'Alpha Company',
				userId: 'user-1',
				email: 'owner@example.com'
			})
		).rejects.toMatchObject({
			status: 500,
			message: 'Failed to create organization'
		});

		expect(consoleErrorSpy).toHaveBeenCalledWith('Organization creation error:', 'Failed to create organization');
		expect(port.groupSeeds).toEqual([]);
	});

	it('fails the request when the default rank catalog cannot be seeded', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const port = createOrgProvisioningPort({
			rankCatalogError: 'rank catalog failed'
		});

		await expect(
			provisionOrganization(port, {
				name: 'Alpha Company',
				userId: 'user-1',
				email: 'owner@example.com'
			})
		).rejects.toMatchObject({
			status: 500,
			message: 'rank catalog failed'
		});

		expect(port.rankCatalogSeeds).toHaveLength(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith('Rank catalog seed error:', 'rank catalog failed');
	});
});
