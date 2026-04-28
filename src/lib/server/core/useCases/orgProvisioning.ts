import { getDefaultFederalHolidays } from '$features/calendar/utils/federalHolidays';
import { fail } from '$lib/server/core/errors';
import { sanitizeString } from '$lib/server/validation';
import type { Da6AvailabilityTreatment } from '$lib/types';

export interface OrgProvisioningAvailability {
	allowed: boolean;
	message?: string;
}

export interface OrgProvisioningCreateResult {
	orgId: string | null;
	errorMessage: string | null;
}

export interface OrgProvisioningGroupSeed {
	name: string;
	sortOrder: number;
}

export interface OrgProvisioningStatusTypeSeed {
	name: string;
	color: string;
	textColor: string;
	sortOrder: number;
	da6AvailabilityTreatment?: Da6AvailabilityTreatment | null;
}

export interface OrgProvisioningAssignmentTypeSeed {
	name: string;
	shortName: string;
	assignTo: string;
	color: string;
	sortOrder: number;
}

export interface OrgProvisioningSpecialDaySeed {
	date: string;
	name: string;
	type: string;
}

export interface OrgProvisioningPort {
	/**
	 * Returns whether the user can create an organization.
	 * Provider failures still throw here so callers preserve the current 500 semantics from the
	 * existing subscription gate while the rest of bootstrap remains best-effort.
	 */
	canCreateOrganization(userId: string): Promise<OrgProvisioningAvailability>;
	createOrganizationWithOwner(name: string): Promise<OrgProvisioningCreateResult>;
	updateOwnerMembershipEmail(input: {
		organizationId: string;
		userId: string;
		email: string | undefined;
	}): Promise<string | null>;
	seedDefaultGroups(organizationId: string, groups: OrgProvisioningGroupSeed[]): Promise<string | null>;
	seedDefaultStatusTypes(organizationId: string, statusTypes: OrgProvisioningStatusTypeSeed[]): Promise<string | null>;
	seedDefaultAssignmentTypes(
		organizationId: string,
		assignmentTypes: OrgProvisioningAssignmentTypeSeed[]
	): Promise<string | null>;
	seedFederalHolidays(organizationId: string, specialDays: OrgProvisioningSpecialDaySeed[]): Promise<string | null>;
}

const DEFAULT_GROUPS: OrgProvisioningGroupSeed[] = [
	{ name: 'Leadership', sortOrder: 0 },
	{ name: 'Alpha', sortOrder: 1 },
	{ name: 'Bravo', sortOrder: 2 }
];

const DEFAULT_STATUS_TYPES: OrgProvisioningStatusTypeSeed[] = [
	{
		name: 'Leave',
		color: '#48bb78',
		textColor: '#ffffff',
		sortOrder: 0,
		da6AvailabilityTreatment: 'authorized-absence'
	},
	{
		name: 'School',
		color: '#4299e1',
		textColor: '#ffffff',
		sortOrder: 1,
		da6AvailabilityTreatment: 'authorized-absence'
	},
	{
		name: 'Training / TDY',
		color: '#9f7aea',
		textColor: '#ffffff',
		sortOrder: 2,
		da6AvailabilityTreatment: 'authorized-absence'
	},
	{
		name: 'Appointment',
		color: '#ed8936',
		textColor: '#ffffff',
		sortOrder: 3,
		da6AvailabilityTreatment: null
	},
	{
		name: 'Sick',
		color: '#e53e3e',
		textColor: '#ffffff',
		sortOrder: 4,
		da6AvailabilityTreatment: 'authorized-absence'
	},
	{
		name: 'Other Duty / Detail',
		color: '#a0522d',
		textColor: '#ffffff',
		sortOrder: 5,
		da6AvailabilityTreatment: 'other-duty'
	},
	{
		name: 'CQ/SD',
		color: '#dc2626',
		textColor: '#ffffff',
		sortOrder: 6,
		da6AvailabilityTreatment: 'other-duty'
	}
];

const DEFAULT_ASSIGNMENT_TYPES: OrgProvisioningAssignmentTypeSeed[] = [
	{
		name: 'Staff Duty',
		shortName: 'SD',
		assignTo: 'personnel',
		color: '#dc2626',
		sortOrder: 0
	}
];

export async function loadOrganizationProvisioning(
	port: OrgProvisioningPort,
	input: { userId: string }
): Promise<{ canCreate: boolean; canCreateMessage: string | undefined }> {
	const availability = await port.canCreateOrganization(input.userId);

	return {
		canCreate: availability.allowed,
		canCreateMessage: availability.message
	};
}

export async function provisionOrganization(
	port: OrgProvisioningPort,
	input: {
		name: string;
		userId: string;
		email?: string | null;
	}
): Promise<{ orgId: string }> {
	const name = sanitizeString(input.name, 100);
	if (!name) {
		fail(400, 'Organization name is required');
	}

	const availability = await port.canCreateOrganization(input.userId);
	if (!availability.allowed) {
		fail(403, availability.message ?? 'Organization creation is not allowed');
	}

	const created = await port.createOrganizationWithOwner(name);
	if (!created.orgId) {
		console.error('Organization creation error:', created.errorMessage);
		fail(500, created.errorMessage ?? 'Failed to create organization');
	}

	const ownerEmailUpdateError = await port.updateOwnerMembershipEmail({
		organizationId: created.orgId,
		userId: input.userId,
		email: input.email?.toLowerCase()
	});
	logBootstrapError('Owner membership email update error:', ownerEmailUpdateError);

	logBootstrapError('Groups seed error:', await port.seedDefaultGroups(created.orgId, DEFAULT_GROUPS));
	logBootstrapError('Status types seed error:', await port.seedDefaultStatusTypes(created.orgId, DEFAULT_STATUS_TYPES));
	logBootstrapError(
		'Assignment types seed error:',
		await port.seedDefaultAssignmentTypes(created.orgId, DEFAULT_ASSIGNMENT_TYPES)
	);

	const holidaySeeds = getDefaultFederalHolidays().map((holiday) => ({
		date: holiday.date,
		name: holiday.name,
		type: holiday.type
	}));
	logBootstrapError('Holidays seed error:', await port.seedFederalHolidays(created.orgId, holidaySeeds));

	return { orgId: created.orgId };
}

function logBootstrapError(label: string, errorMessage: string | null): void {
	if (errorMessage) {
		console.error(label, errorMessage);
	}
}
