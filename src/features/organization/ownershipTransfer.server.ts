import { fail } from '$lib/errors';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireGovernancePolicy } from '$lib/access/index.server';
import { sanitizeString, validateUUID } from '$lib/server/validation';
import {
	ORGANIZATION_TRANSFER_OWNERSHIP_ACTION,
	type SensitiveActionAuthorizer,
	type SensitiveActionDecision
} from '$features/identity/contracts';
import { sensitiveActionDecisionAuditDetails, throwSensitiveActionFailure } from '$features/identity/index.server';

type GovernancePorts = Parameters<typeof requireGovernancePolicy>[0];

export interface OrganizationOwnershipTransferPort {
	findOwnershipTransferTarget(
		orgId: string,
		userId: string
	): Promise<{ userId: string | null; email: string | null; role: string | null } | null>;
	transferOwnership(orgId: string, newOwnerId: string): Promise<string | null>;
	lookupOrganization(orgId: string): Promise<{ name: string | null; errorMessage: string | null }>;
}

interface OwnershipTransferPorts extends GovernancePorts {
	notifications: Pick<NotificationDeliveryPort, 'notifyUser'>;
	administration: OrganizationOwnershipTransferPort;
	sensitiveActionAuthorizer: SensitiveActionAuthorizer;
}

interface TransferOrganizationOwnershipInput {
	newOwnerId: string;
	confirmTransferEmail: string;
}

export async function transferOrganizationOwnership(
	ports: OwnershipTransferPorts,
	input: TransferOrganizationOwnershipInput
): Promise<{ transferSuccess: true }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.transferOwnership);

	if (!validateUUID(input.newOwnerId)) {
		fail(400, 'Invalid user ID');
	}

	const targetMember = await ports.administration.findOwnershipTransferTarget(ports.auth.orgId, input.newOwnerId);
	if (!targetMember || targetMember.role === 'owner' || !targetMember.userId || !targetMember.email) {
		fail(400, 'Select an eligible member to receive ownership');
	}

	const confirmTransferEmail = sanitizeString(input.confirmTransferEmail, 320).toLowerCase();
	const targetEmail = sanitizeString(targetMember.email, 320).toLowerCase();
	if (confirmTransferEmail !== targetEmail) {
		fail(400, 'Member email does not match');
	}

	const decision = await ports.sensitiveActionAuthorizer.authorize({
		action: ORGANIZATION_TRANSFER_OWNERSHIP_ACTION,
		actorUserId: ports.auth.userId,
		target: { type: 'organization', id: ports.auth.orgId }
	});
	const sensitiveAction = sensitiveActionDecisionAuditDetails(decision);
	if (!decision.allowed) {
		auditDeniedSensitiveAction(ports, decision, { newOwnerId: input.newOwnerId });
		throwSensitiveActionFailure(decision);
	}

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

function auditDeniedSensitiveAction(
	ports: OwnershipTransferPorts,
	decision: SensitiveActionDecision,
	details: Record<string, unknown>
): void {
	ports.audit.log({
		action: 'org.ownership_transfer_authorization_denied',
		resourceType: 'organization',
		resourceId: ports.auth.orgId,
		details: {
			...details,
			sensitiveAction: sensitiveActionDecisionAuditDetails(decision)
		},
		severity: 'warning'
	});
}
