import { sanitizeString } from '$lib/server/validation';
import { fail } from '$lib/errors';

export interface OrgProvisioningCreateResult {
	orgId: string | null;
	errorMessage: string | null;
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
	seedDefaultAssignmentTypes(organizationId: string): Promise<string | null>;
	seedFederalHolidays(organizationId: string): Promise<string | null>;
	seedDefaultRankCatalog(organizationId: string): Promise<string | null>;
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
	logBootstrapError('Assignment types seed error:', await port.seedDefaultAssignmentTypes(created.orgId));

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
