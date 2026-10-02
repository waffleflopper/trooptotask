import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { AuthContext, AuditPort } from '$lib/server/core/ports';
import { fail } from '$lib/errors';
import { sanitizeString } from '$lib/server/validation';
import { requireGovernancePolicy } from './governancePolicy';
import { isDuplicateOrganizationSlugError, validateOrganizationUrlSlug } from './organizationUrlSlug';

export interface OrganizationSettingsAdministrationPort {
	renameOrganization(orgId: string, name: string): Promise<string | null>;
	updateOrganizationUrlSlug(orgId: string, urlSlug: string | null): Promise<string | null>;
	findOrganizationByUrlSlug(urlSlug: string): Promise<{ id: string } | null>;
}

interface OrganizationSettingsAdministrationPorts {
	auth: AuthContext;
	audit: AuditPort;

	administration: OrganizationSettingsAdministrationPort;
}

interface RenameOrganizationInput {
	name: string;
}

interface UpdateOrganizationUrlSlugInput {
	urlSlug: string;
}

export async function renameOrganization(
	ports: OrganizationSettingsAdministrationPorts,
	input: RenameOrganizationInput
): Promise<{ nameSuccess: true }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.rename);

	const name = sanitizeString(input.name, 100);
	if (!name) {
		fail(400, 'Organization name is required');
	}

	const errorMessage = await ports.administration.renameOrganization(ports.auth.orgId, name);
	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'org.renamed',
		resourceType: 'organization',
		details: { name }
	});

	return { nameSuccess: true };
}

export async function updateOrganizationUrlSlug(
	ports: OrganizationSettingsAdministrationPorts,
	input: UpdateOrganizationUrlSlugInput
): Promise<{ slugSuccess: true; orgUrlSlug: string }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.rename);

	const urlSlug = validateOrganizationUrlSlug(input.urlSlug);
	const existing = await ports.administration.findOrganizationByUrlSlug(urlSlug);
	if (existing && existing.id !== ports.auth.orgId) {
		fail(400, 'Organization URL slug is already in use');
	}

	const errorMessage = await ports.administration.updateOrganizationUrlSlug(ports.auth.orgId, urlSlug);
	if (isDuplicateOrganizationSlugError(errorMessage)) {
		fail(400, 'Organization URL slug is already in use');
	}
	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'org.url_slug_updated',
		resourceType: 'organization',
		details: { urlSlug }
	});

	return { slugSuccess: true, orgUrlSlug: urlSlug };
}

export async function clearOrganizationUrlSlug(
	ports: OrganizationSettingsAdministrationPorts
): Promise<{ slugSuccess: true; orgUrlSlug: null }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.rename);

	const errorMessage = await ports.administration.updateOrganizationUrlSlug(ports.auth.orgId, null);
	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'org.url_slug_cleared',
		resourceType: 'organization'
	});

	return { slugSuccess: true, orgUrlSlug: null };
}
