import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	provisionOrganization,
	type OrgProvisioningAssignmentTypeSeed,
	type OrgProvisioningGroupSeed,
	type OrgProvisioningPort,
	type OrgProvisioningSpecialDaySeed,
	type OrgProvisioningStatusTypeSeed
} from './orgProvisioning';

function createOrgProvisioningPort(
	options: {
		createResult?: { orgId: string | null; errorMessage: string | null };
		rankCatalogError?: string | null;
	} = {}
): OrgProvisioningPort & {
	createRequests: string[];
	ownerEmailUpdates: Array<{ organizationId: string; userId: string; email: string | undefined }>;
	groupSeeds: Array<{ organizationId: string; groups: OrgProvisioningGroupSeed[] }>;
	statusTypeSeeds: Array<{ organizationId: string; statusTypes: OrgProvisioningStatusTypeSeed[] }>;
	assignmentTypeSeeds: Array<{ organizationId: string; assignmentTypes: OrgProvisioningAssignmentTypeSeed[] }>;
	federalHolidaySeeds: Array<{ organizationId: string; specialDays: OrgProvisioningSpecialDaySeed[] }>;
	rankCatalogSeeds: string[];
} {
	const createRequests: string[] = [];
	const ownerEmailUpdates: Array<{ organizationId: string; userId: string; email: string | undefined }> = [];
	const groupSeeds: Array<{ organizationId: string; groups: OrgProvisioningGroupSeed[] }> = [];
	const statusTypeSeeds: Array<{ organizationId: string; statusTypes: OrgProvisioningStatusTypeSeed[] }> = [];
	const assignmentTypeSeeds: Array<{ organizationId: string; assignmentTypes: OrgProvisioningAssignmentTypeSeed[] }> =
		[];
	const federalHolidaySeeds: Array<{ organizationId: string; specialDays: OrgProvisioningSpecialDaySeed[] }> = [];
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
		async seedDefaultGroups(organizationId, groups) {
			groupSeeds.push({ organizationId, groups });
			return null;
		},
		async seedDefaultStatusTypes(organizationId, statusTypes) {
			statusTypeSeeds.push({ organizationId, statusTypes });
			return null;
		},
		async seedDefaultAssignmentTypes(organizationId, assignmentTypes) {
			assignmentTypeSeeds.push({ organizationId, assignmentTypes });
			return null;
		},
		async seedFederalHolidays(organizationId, specialDays) {
			federalHolidaySeeds.push({ organizationId, specialDays });
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
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
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
		expect(port.groupSeeds).toEqual([
			{
				organizationId: 'org-1',
				groups: [
					{ name: 'Leadership', sortOrder: 0 },
					{ name: 'Alpha', sortOrder: 1 },
					{ name: 'Bravo', sortOrder: 2 }
				]
			}
		]);
		expect(port.statusTypeSeeds).toEqual([
			{
				organizationId: 'org-1',
				statusTypes: [
					{
						name: 'Leave',
						color: '#48bb78',
						textColor: '#ffffff',
						sortOrder: 0
					},
					{
						name: 'School',
						color: '#4299e1',
						textColor: '#ffffff',
						sortOrder: 1
					},
					{
						name: 'Training / TDY',
						color: '#9f7aea',
						textColor: '#ffffff',
						sortOrder: 2
					},
					{
						name: 'Appointment',
						color: '#ed8936',
						textColor: '#ffffff',
						sortOrder: 3
					},
					{
						name: 'Sick',
						color: '#e53e3e',
						textColor: '#ffffff',
						sortOrder: 4
					},
					{
						name: 'Other Duty / Detail',
						color: '#a0522d',
						textColor: '#ffffff',
						sortOrder: 5
					},
					{
						name: 'CQ/SD',
						color: '#dc2626',
						textColor: '#ffffff',
						sortOrder: 6
					}
				]
			}
		]);
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
		expect(port.federalHolidaySeeds).toHaveLength(1);
		expect(port.federalHolidaySeeds[0]?.organizationId).toBe('org-1');
		expect(port.federalHolidaySeeds[0]?.specialDays).toHaveLength(44);
		expect(port.federalHolidaySeeds[0]?.specialDays).toEqual(
			expect.arrayContaining([
				{ date: '2025-01-01', name: "New Year's Day", type: 'federal-holiday' },
				{ date: '2026-07-03', name: 'Independence Day', type: 'federal-holiday' },
				{ date: '2027-11-25', name: 'Thanksgiving Day', type: 'federal-holiday' },
				{ date: '2028-12-25', name: 'Christmas Day', type: 'federal-holiday' }
			])
		);
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
