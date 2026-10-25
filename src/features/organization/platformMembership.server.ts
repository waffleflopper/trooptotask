import type { AuditEvent } from '$lib/audit/contracts';
import { ORGANIZATION_TRANSFER_OWNERSHIP_ACTION, type SensitiveActionAuthorizer } from '$features/identity/contracts';
import { sensitiveActionDecisionAuditDetails, throwSensitiveActionFailure } from '$features/identity/index.server';

import type { OrganizationTransferResult, OrganizationPlatformMembershipPort } from './platformMembershipTypes';

interface Dependencies {
	actor: { userId: string };
	port: OrganizationPlatformMembershipPort;
	sensitiveActionAuthorizer: SensitiveActionAuthorizer;
	audit: { log(event: AuditEvent): Promise<void> };
}

export function createOrganizationPlatformMembershipAdministration(deps: Dependencies) {
	async function authorize(action: Parameters<SensitiveActionAuthorizer['authorize']>[0]['action'], orgId: string) {
		const decision = await deps.sensitiveActionAuthorizer.authorize({
			action,
			actorUserId: deps.actor.userId,
			target: { type: 'organization', id: orgId }
		});
		if (!decision.allowed) {
			await deps.audit.log({
				action: 'admin.org.membership_authorization_denied',
				resourceType: 'organization',
				resourceId: orgId,
				orgId,
				details: { sensitiveAction: sensitiveActionDecisionAuditDetails(decision) },
				severity: 'warning'
			});
			throwSensitiveActionFailure(decision);
		}
		return sensitiveActionDecisionAuditDetails(decision);
	}

	return {
		async transferOwnership(input: {
			orgId: string;
			targetUserId: string;
			confirmName: string;
		}): Promise<OrganizationTransferResult> {
			const sensitiveAction = await authorize(ORGANIZATION_TRANSFER_OWNERSHIP_ACTION, input.orgId);
			const result = await deps.port.transferOwnership({ ...input, actorUserId: deps.actor.userId });
			if (result.status === 'updated') {
				await deps.audit.log({
					action: 'admin.org.transfer_ownership',
					resourceType: 'organization',
					resourceId: result.orgId,
					orgId: result.orgId,
					details: {
						fromUserId: result.fromUserId,
						toUserId: result.toUserId,
						orgName: result.orgName,
						sensitiveAction
					},
					severity: 'critical'
				});
			}
			return result;
		}
	};
}
