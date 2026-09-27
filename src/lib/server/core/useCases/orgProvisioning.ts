import { fail } from '$lib/server/core/errors';
import { sanitizeString } from '$lib/server/validation';

export interface OrgProvisioningCreateResult {
	orgId: string | null;
	errorMessage: string | null;
}

export interface OrgProvisioningAssignmentTypeSeed {
	name: string;
	shortName: string;
	assignTo: string;
	color: string;
	sortOrder: number;
}

export interface OrgProvisioningPort {
	createOrganizationWithOwner(name: string): Promise<OrgProvisioningCreateResult>;
	updateOwnerMembershipEmail(input: {
		organizationId: string;
		userId: string;
		email: string | undefined;
	}): Promise<string | null>;
	seedDefaultGroups(organizationId: string): Promise<string | null>;
	seedDefaultStatusTypes(organizationId: string): Promise<string | null>;
	seedDefaultAssignmentTypes(
		organizationId: string,
		assignmentTypes: OrgProvisioningAssignmentTypeSeed[]
	): Promise<string | null>;
	seedFederalHolidays(organizationId: string): Promise<string | null>;
	seedDefaultRankCatalog(organizationId: string): Promise<string | null>;
}

const DEFAULT_ASSIGNMENT_TYPES: OrgProvisioningAssignmentTypeSeed[] = [
	{
		name: 'Staff Duty',
		shortName: 'SD',
		assignTo: 'personnel',
		color: '#dc2626',
		sortOrder: 0
	}
];

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

	logBootstrapError('Groups seed error:', await port.seedDefaultGroups(created.orgId));
	logBootstrapError('Status types seed error:', await port.seedDefaultStatusTypes(created.orgId));
	logBootstrapError(
		'Assignment types seed error:',
		await port.seedDefaultAssignmentTypes(created.orgId, DEFAULT_ASSIGNMENT_TYPES)
	);

	logBootstrapError('Holidays seed error:', await port.seedFederalHolidays(created.orgId));
	const rankCatalogSeedError = await port.seedDefaultRankCatalog(created.orgId);
	if (rankCatalogSeedError) {
		console.error('Rank catalog seed error:', rankCatalogSeedError);
		fail(500, rankCatalogSeedError);
	}

	return { orgId: created.orgId };
}

function logBootstrapError(label: string, errorMessage: string | null): void {
	if (errorMessage) {
		console.error(label, errorMessage);
	}
}
