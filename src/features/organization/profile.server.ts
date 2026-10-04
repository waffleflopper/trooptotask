import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { sanitizeString } from '$lib/server/validation';
import { requireGovernancePolicy } from '$lib/access/index.server';
import { isDuplicateOrganizationSlugError, validateOrganizationUrlSlug } from './url';

export interface OrganizationProfilePort {
	renameOrganization(orgId: string, name: string): Promise<string | null>;
	updateOrganizationUrlSlug(orgId: string, urlSlug: string | null): Promise<string | null>;
	findOrganizationByUrlSlug(urlSlug: string): Promise<{ id: string } | null>;
}

type OrganizationProfilePorts = {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	administration: OrganizationProfilePort;
};

interface RenameOrganizationInput {
	name: string;
}

interface UpdateOrganizationUrlSlugInput {
	urlSlug: string;
}

export async function renameOrganization(
	ports: OrganizationProfilePorts,
	input: RenameOrganizationInput
): Promise<{ nameSuccess: true }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.rename);

	const name = sanitizeString(input.name, 100);
	if (!name) {
		fail(400, 'Organization name is required');
	}

	const errorMessage = await ports.administration.renameOrganization(ports.auth.orgId.toLowerCase(), name);
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
	ports: OrganizationProfilePorts,
	input: UpdateOrganizationUrlSlugInput
): Promise<{ slugSuccess: true; orgUrlSlug: string }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.rename);

	const urlSlug = validateOrganizationUrlSlug(input.urlSlug);
	const existing = await ports.administration.findOrganizationByUrlSlug(urlSlug);
	if (existing && existing.id !== ports.auth.orgId.toLowerCase()) {
		fail(400, 'Organization URL slug is already in use');
	}

	const errorMessage = await ports.administration.updateOrganizationUrlSlug(ports.auth.orgId.toLowerCase(), urlSlug);
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
	ports: OrganizationProfilePorts
): Promise<{ slugSuccess: true; orgUrlSlug: null }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.rename);

	const errorMessage = await ports.administration.updateOrganizationUrlSlug(ports.auth.orgId.toLowerCase(), null);
	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'org.url_slug_cleared',
		resourceType: 'organization'
	});

	return { slugSuccess: true, orgUrlSlug: null };
}
