import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDefaultFederalHolidays } from '$features/calendar/utils/federalHolidays';
import { BUILT_IN_RANK_CATALOG } from '$lib/domain/rankCatalog';
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
		updateOwnerMembershipEmailError?: string | null;
		groupsError?: string | null;
		statusTypesError?: string | null;
		assignmentTypesError?: string | null;
		federalHolidaysError?: string | null;
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
			return options.updateOwnerMembershipEmailError ?? null;
		},
		async seedDefaultGroups(organizationId, groups) {
			groupSeeds.push({ organizationId, groups });
			return options.groupsError ?? null;
		},
		async seedDefaultStatusTypes(organizationId, statusTypes) {
			statusTypeSeeds.push({ organizationId, statusTypes });
			return options.statusTypesError ?? null;
		},
		async seedDefaultAssignmentTypes(organizationId, assignmentTypes) {
			assignmentTypeSeeds.push({ organizationId, assignmentTypes });
			return options.assignmentTypesError ?? null;
		},
		async seedFederalHolidays(organizationId, specialDays) {
			federalHolidaySeeds.push({ organizationId, specialDays });
			return options.federalHolidaysError ?? null;
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
	});

	it('preserves the current bootstrap defaults behind the provisioning boundary', async () => {
		const port = createOrgProvisioningPort();
		const result = await provisionOrganization(port, {
			name: '  Alpha   Company  ',
			userId: 'user-1',
			email: 'OWNER@EXAMPLE.COM'
		});
		const expectedHolidays = getDefaultFederalHolidays();

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
		expect(port.federalHolidaySeeds[0]?.specialDays).toHaveLength(expectedHolidays.length);
		expect(port.federalHolidaySeeds[0]?.specialDays[0]).toEqual({
			date: expectedHolidays[0]?.date,
			name: expectedHolidays[0]?.name,
			type: expectedHolidays[0]?.type
		});
		expect(port.rankCatalogSeeds).toHaveLength(1);
		expect(port.rankCatalogSeeds[0]?.organizationId).toBe('org-1');
		expect(port.rankCatalogSeeds[0]?.entries).toHaveLength(BUILT_IN_RANK_CATALOG.length);
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

	it('keeps seed failures best-effort while logging the existing bootstrap errors', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const port = createOrgProvisioningPort({
			updateOwnerMembershipEmailError: 'email update failed',
			groupsError: 'groups failed',
			statusTypesError: 'statuses failed',
			assignmentTypesError: 'assignments failed',
			federalHolidaysError: 'holidays failed'
		});

		const result = await provisionOrganization(port, {
			name: 'Alpha Company',
			userId: 'user-1',
			email: 'owner@example.com'
		});

		expect(result).toEqual({ orgId: 'org-1' });
		expect(consoleErrorSpy).toHaveBeenCalledWith('Owner membership email update error:', 'email update failed');
		expect(consoleErrorSpy).toHaveBeenCalledWith('Groups seed error:', 'groups failed');
		expect(consoleErrorSpy).toHaveBeenCalledWith('Status types seed error:', 'statuses failed');
		expect(consoleErrorSpy).toHaveBeenCalledWith('Assignment types seed error:', 'assignments failed');
		expect(consoleErrorSpy).toHaveBeenCalledWith('Holidays seed error:', 'holidays failed');
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
