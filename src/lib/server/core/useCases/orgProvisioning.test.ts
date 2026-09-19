import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	loadOrganizationProvisioning,
	provisionOrganization,
	type OrgProvisioningAssignmentTypeSeed,
	type OrgProvisioningGroupSeed,
	type OrgProvisioningRankCatalogSeed,
	type OrgProvisioningPort,
	type OrgProvisioningSpecialDaySeed,
	type OrgProvisioningStatusTypeSeed
} from './orgProvisioning';

function createOrgProvisioningPort(
	options: {
		availability?: { allowed: boolean; message?: string };
		availabilityError?: Error;
		createResult?: { orgId: string | null; errorMessage: string | null };
		rankCatalogError?: string | null;
	} = {}
): OrgProvisioningPort & {
	availabilityRequests: string[];
	createRequests: string[];
	ownerEmailUpdates: Array<{ organizationId: string; userId: string; email: string | undefined }>;
	groupSeeds: Array<{ organizationId: string; groups: OrgProvisioningGroupSeed[] }>;
	statusTypeSeeds: Array<{ organizationId: string; statusTypes: OrgProvisioningStatusTypeSeed[] }>;
	assignmentTypeSeeds: Array<{ organizationId: string; assignmentTypes: OrgProvisioningAssignmentTypeSeed[] }>;
	federalHolidaySeeds: Array<{ organizationId: string; specialDays: OrgProvisioningSpecialDaySeed[] }>;
	rankCatalogSeeds: Array<{ organizationId: string; entries: OrgProvisioningRankCatalogSeed[] }>;
} {
	const availabilityRequests: string[] = [];
	const createRequests: string[] = [];
	const ownerEmailUpdates: Array<{ organizationId: string; userId: string; email: string | undefined }> = [];
	const groupSeeds: Array<{ organizationId: string; groups: OrgProvisioningGroupSeed[] }> = [];
	const statusTypeSeeds: Array<{ organizationId: string; statusTypes: OrgProvisioningStatusTypeSeed[] }> = [];
	const assignmentTypeSeeds: Array<{ organizationId: string; assignmentTypes: OrgProvisioningAssignmentTypeSeed[] }> =
		[];
	const federalHolidaySeeds: Array<{ organizationId: string; specialDays: OrgProvisioningSpecialDaySeed[] }> = [];
	const rankCatalogSeeds: Array<{ organizationId: string; entries: OrgProvisioningRankCatalogSeed[] }> = [];

	return {
		availabilityRequests,
		createRequests,
		ownerEmailUpdates,
		groupSeeds,
		statusTypeSeeds,
		assignmentTypeSeeds,
		federalHolidaySeeds,
		rankCatalogSeeds,
		async canCreateOrganization(userId) {
			availabilityRequests.push(userId);
			if (options.availabilityError) {
				throw options.availabilityError;
			}
			return options.availability ?? { allowed: true };
		},
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
		async seedDefaultRankCatalog(organizationId, entries) {
			rankCatalogSeeds.push({ organizationId, entries });
			return options.rankCatalogError ?? null;
		}
	};
}

describe('loadOrganizationProvisioning', () => {
	it('returns the create-organization eligibility from the provisioning boundary', async () => {
		const port = createOrgProvisioningPort({
			availability: {
				allowed: false,
				message: 'You can own up to 1 organization on your current plan.'
			}
		});

		const result = await loadOrganizationProvisioning(port, { userId: 'user-1' });

		expect(result).toEqual({
			canCreate: false,
			canCreateMessage: 'You can own up to 1 organization on your current plan.'
		});
		expect(port.availabilityRequests).toEqual(['user-1']);
	});

	it('preserves provider failures from the create-org gate so the route keeps current 500 handling', async () => {
		const availabilityError = new Error('subscription lookup failed');
		const port = createOrgProvisioningPort({ availabilityError });

		await expect(loadOrganizationProvisioning(port, { userId: 'user-1' })).rejects.toBe(availabilityError);
		expect(port.availabilityRequests).toEqual(['user-1']);
	});
});

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
		expect(port.availabilityRequests).toEqual(['user-1']);
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
						sortOrder: 0,
						da6AvailabilityTreatment: 'authorized-absence',
						da6TreatmentReviewed: true
					},
					{
						name: 'School',
						color: '#4299e1',
						textColor: '#ffffff',
						sortOrder: 1,
						da6AvailabilityTreatment: 'authorized-absence',
						da6TreatmentReviewed: true
					},
					{
						name: 'Training / TDY',
						color: '#9f7aea',
						textColor: '#ffffff',
						sortOrder: 2,
						da6AvailabilityTreatment: 'authorized-absence',
						da6TreatmentReviewed: true
					},
					{
						name: 'Appointment',
						color: '#ed8936',
						textColor: '#ffffff',
						sortOrder: 3,
						da6AvailabilityTreatment: null,
						da6TreatmentReviewed: true
					},
					{
						name: 'Sick',
						color: '#e53e3e',
						textColor: '#ffffff',
						sortOrder: 4,
						da6AvailabilityTreatment: 'authorized-absence',
						da6TreatmentReviewed: true
					},
					{
						name: 'Other Duty / Detail',
						color: '#a0522d',
						textColor: '#ffffff',
						sortOrder: 5,
						da6AvailabilityTreatment: 'other-duty',
						da6TreatmentReviewed: true
					},
					{
						name: 'CQ/SD',
						color: '#dc2626',
						textColor: '#ffffff',
						sortOrder: 6,
						da6AvailabilityTreatment: 'other-duty',
						da6TreatmentReviewed: true
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
		expect(port.rankCatalogSeeds).toHaveLength(1);
		expect(port.rankCatalogSeeds[0]?.organizationId).toBe('org-1');
		expect(port.rankCatalogSeeds[0]?.entries.map((entry) => entry.code).sort()).toEqual(
			[
				'GEN',
				'LTG',
				'MG',
				'BG',
				'COL',
				'LTC',
				'MAJ',
				'CPT',
				'1LT',
				'2LT',
				'CW5',
				'CW4',
				'CW3',
				'CW2',
				'WO1',
				'CSM',
				'SGM',
				'1SG',
				'MSG',
				'SFC',
				'SSG',
				'SGT',
				'CPL',
				'SPC',
				'SP4',
				'PFC',
				'PV2',
				'PV1',
				'CIV',
				'CUSTOM'
			].sort()
		);
		expect(port.rankCatalogSeeds[0]?.entries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'SGT',
					label: 'Sergeant',
					service: 'army',
					category: 'enlisted',
					payGrade: 'E-5',
					state: 'active',
					source: 'built-in'
				})
			])
		);
		expect(port.rankCatalogSeeds[0]?.entries).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ service: 'navy' })])
		);
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

		expect(port.availabilityRequests).toEqual([]);
		expect(port.createRequests).toEqual([]);
	});

	it('preserves the current create-limit failure before provisioning starts', async () => {
		const port = createOrgProvisioningPort({
			availability: {
				allowed: false,
				message: 'You can own up to 1 organization(s) on your current plan.'
			}
		});

		await expect(
			provisionOrganization(port, {
				name: 'Alpha Company',
				userId: 'user-1',
				email: 'owner@example.com'
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You can own up to 1 organization(s) on your current plan.'
		});

		expect(port.createRequests).toEqual([]);
	});

	it('stops before bootstrap work when the create-org gate throws a provider failure', async () => {
		const availabilityError = new Error('subscription lookup failed');
		const port = createOrgProvisioningPort({ availabilityError });

		await expect(
			provisionOrganization(port, {
				name: 'Alpha Company',
				userId: 'user-1',
				email: 'owner@example.com'
			})
		).rejects.toBe(availabilityError);

		expect(port.createRequests).toEqual([]);
		expect(port.ownerEmailUpdates).toEqual([]);
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
