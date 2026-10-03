import type { AuditPort } from '$lib/audit/contracts';
import {
	ORGANIZATION_MEMBER_UPDATE_HIGH_PRIVILEGE_ACTION,
	ORGANIZATION_TRANSFER_OWNERSHIP_ACTION,
	type SensitiveActionAuthorizer
} from '$features/identity/contracts';
import { sensitiveActionDecisionAuditDetails, throwSensitiveActionFailure } from '$features/identity/index.server';

import type {
	OrganizationSupportMember,
	OrganizationPromotionResult,
	OrganizationTransferResult,
	OrganizationPlatformMembershipPort
} from './platformMembershipTypes';

interface Dependencies {
	/** Hook-verified actor and current request role, supplied by server composition. */
	actor: { userId: string; role: 'super_admin' | 'support' | 'billing' };
	port: OrganizationPlatformMembershipPort;
	sensitiveActionAuthorizer: SensitiveActionAuthorizer;
	audit: AuditPort;
}

export function createOrganizationPlatformMembershipAdministration(deps: Dependencies) {
	async function authorize(action: Parameters<SensitiveActionAuthorizer['authorize']>[0]['action'], orgId: string) {
		const decision = await deps.sensitiveActionAuthorizer.authorize({
			action,
			actorUserId: deps.actor.userId,
			target: { type: 'organization', id: orgId }
		});
		if (!decision.allowed) {
			deps.audit.log({
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
		async listMembers(orgId: string): Promise<OrganizationSupportMember[]> {
			if (deps.actor.role === 'billing')
				throw Object.assign(new Error('Platform support access is required'), { status: 403 });
			return deps.port.listMembers(orgId);
		},
		async makeAdmin(input: { orgId: string; targetUserId: string }): Promise<OrganizationPromotionResult> {
			if (deps.actor.role !== 'super_admin') return { status: 'forbidden' };
			const sensitiveAction = await authorize(ORGANIZATION_MEMBER_UPDATE_HIGH_PRIVILEGE_ACTION, input.orgId);
			const result = await deps.port.promoteMember({ ...input, actorUserId: deps.actor.userId });
			if (result.status === 'updated') {
				deps.audit.log({
					action: 'admin.org.make_admin',
					resourceType: 'organization',
					resourceId: result.orgId,
					orgId: result.orgId,
					details: { targetUserId: result.targetUserId, previousRole: 'member', sensitiveAction },
					severity: 'warning'
				});
			}
			return result;
		},
		async transferOwnership(input: {
			orgId: string;
			targetUserId: string;
			confirmName: string;
		}): Promise<OrganizationTransferResult> {
			if (deps.actor.role !== 'super_admin') return { status: 'forbidden' };
			const sensitiveAction = await authorize(ORGANIZATION_TRANSFER_OWNERSHIP_ACTION, input.orgId);
			const result = await deps.port.transferOwnership({ ...input, actorUserId: deps.actor.userId });
			if (result.status === 'updated') {
				deps.audit.log({
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
