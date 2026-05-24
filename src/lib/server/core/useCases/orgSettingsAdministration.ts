import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { AuthContext, AuditPort, NotificationPort, ReadOnlyGuard } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';
import { sanitizeString, validateUUID } from '$lib/server/validation';
import {
	ORGANIZATION_DELETE_ACTION,
	ORGANIZATION_TRANSFER_OWNERSHIP_ACTION,
	checkSensitiveAction,
	sensitiveActionDecisionAuditDetails,
	throwSensitiveActionFailure,
	type SensitiveAction,
	type SensitiveActionAuthorizer,
	type SensitiveActionDecision
} from '$lib/server/sensitiveActionAuthorizer';
import { requireGovernancePolicy } from './governancePolicy';
import { isDuplicateOrganizationSlugError, validateOrganizationUrlSlug } from './organizationUrlSlug';

export interface OrganizationSettingsAdministrationPort {
	renameOrganization(orgId: string, name: string): Promise<string | null>;
	updateOrganizationUrlSlug(orgId: string, urlSlug: string | null): Promise<string | null>;
	findOrganizationByUrlSlug(urlSlug: string): Promise<{ id: string } | null>;
	transferOwnership(orgId: string, newOwnerId: string): Promise<string | null>;
	lookupOrganization(orgId: string): Promise<{ name: string | null; errorMessage: string | null }>;
	deleteOrganization(orgId: string): Promise<string | null>;
}

interface OrganizationSettingsAdministrationPorts {
	auth: AuthContext;
	audit: AuditPort;
	notifications: NotificationPort;
	readOnlyGuard?: ReadOnlyGuard;
	administration: OrganizationSettingsAdministrationPort;
}

type OrganizationSensitiveActionPorts = OrganizationSettingsAdministrationPorts & {
	sensitiveActionAuthorizer: SensitiveActionAuthorizer;
};

interface TransferOrganizationOwnershipInput {
	newOwnerId: string;
}

interface DeleteOrganizationInput {
	confirmName: string;
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

export async function transferOrganizationOwnership(
	ports: OrganizationSensitiveActionPorts,
	input: TransferOrganizationOwnershipInput
): Promise<{ transferSuccess: true }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.transferOwnership);

	if (!validateUUID(input.newOwnerId)) {
		fail(400, 'Invalid user ID');
	}

	const sensitiveAction = await authorizeOrganizationSensitiveAction(ports, {
		action: ORGANIZATION_TRANSFER_OWNERSHIP_ACTION,
		deniedAuditAction: 'org.ownership_transfer_authorization_denied',
		details: { newOwnerId: input.newOwnerId }
	});

	const errorMessage = await ports.administration.transferOwnership(ports.auth.orgId, input.newOwnerId);
	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'org.ownership_transferred',
		resourceType: 'organization',
		details: { newOwnerId: input.newOwnerId, sensitiveAction },
		severity: 'critical'
	});

	const organization = await ports.administration.lookupOrganization(ports.auth.orgId);

	await ports.notifications.notifyUser(ports.auth.orgId, input.newOwnerId, {
		type: 'ownership_transferred',
		title: 'Ownership Transferred',
		message: `You are now the owner of "${organization.name ?? 'the organization'}".`,
		link: `/org/${ports.auth.orgId}/settings`
	});

	return { transferSuccess: true };
}

export async function deleteOrganization(
	ports: OrganizationSensitiveActionPorts,
	input: DeleteOrganizationInput
): Promise<{ success: true }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.deleteOrganization);

	const organization = await ports.administration.lookupOrganization(ports.auth.orgId);
	if (organization.errorMessage) {
		fail(500, organization.errorMessage);
	}

	const confirmName = sanitizeString(input.confirmName, 100);
	if (confirmName !== sanitizeString(organization.name, 100)) {
		fail(400, 'Organization name does not match');
	}

	const sensitiveAction = await authorizeOrganizationSensitiveAction(ports, {
		action: ORGANIZATION_DELETE_ACTION,
		deniedAuditAction: 'org.delete_authorization_denied'
	});

	const errorMessage = await ports.administration.deleteOrganization(ports.auth.orgId);
	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'org.deleted',
		resourceType: 'organization',
		details: { sensitiveAction },
		severity: 'critical'
	});

	return { success: true };
}

async function authorizeOrganizationSensitiveAction(
	ports: OrganizationSensitiveActionPorts,
	input: { action: SensitiveAction; deniedAuditAction: string; details?: Record<string, unknown> }
): Promise<Record<string, unknown>> {
	const target = { type: 'organization', id: ports.auth.orgId };
	if (!ports.auth.userId) {
		const decision = checkSensitiveAction({
			action: input.action,
			target,
			actor: { userId: null }
		});
		auditDeniedSensitiveAction(ports, input.deniedAuditAction, decision, input.details);
		throwSensitiveActionFailure(decision);
	}

	const decision = await ports.sensitiveActionAuthorizer.authorize({
		action: input.action,
		actorUserId: ports.auth.userId,
		target
	});
	const sensitiveAction = sensitiveActionDecisionAuditDetails(decision);

	if (!decision.allowed) {
		auditDeniedSensitiveAction(ports, input.deniedAuditAction, decision, input.details);
		throwSensitiveActionFailure(decision);
	}

	return sensitiveAction;
}

function auditDeniedSensitiveAction(
	ports: OrganizationSettingsAdministrationPorts,
	action: string,
	decision: SensitiveActionDecision,
	details: Record<string, unknown> = {}
): void {
	ports.audit.log({
		action,
		resourceType: 'organization',
		resourceId: ports.auth.orgId,
		details: {
			...details,
			sensitiveAction: sensitiveActionDecisionAuditDetails(decision)
		},
		severity: 'warning'
	});
}
