export type PlatformMembershipRole = 'owner' | 'admin' | 'member';

export interface PlatformMembershipOrganization {
	id: string;
	name: string;
}

export interface PlatformMembershipRecord {
	orgId: string;
	userId: string;
	role: PlatformMembershipRole;
	email?: string | null;
}

export interface PlatformOrganizationMember {
	userId: string;
	email: string | null;
	role: PlatformMembershipRole;
}

export interface PlatformMembershipAdministrationStore {
	listMembers(orgId: string): Promise<PlatformOrganizationMember[]>;
	getOrganization(orgId: string): Promise<PlatformMembershipOrganization | null>;
	getMembership(input: { orgId: string; userId: string }): Promise<PlatformMembershipRecord | null>;
	getCurrentOwner(orgId: string): Promise<PlatformMembershipRecord | null>;
	setMembershipRole(input: { orgId: string; userId: string; role: PlatformMembershipRole }): Promise<void>;
}

export interface PlatformMembershipAdministrationAuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: 'info' | 'warning' | 'critical';
}

export interface PlatformMembershipAdministrationDependencies {
	store: PlatformMembershipAdministrationStore;
	audit(event: PlatformMembershipAdministrationAuditEvent): void;
}

export type PlatformMakeAdminResult =
	| { status: 'updated'; orgId: string; targetUserId: string }
	| { status: 'target_not_member' }
	| { status: 'already_admin' }
	| { status: 'already_owner' };

export type PlatformTransferOwnershipResult =
	| { status: 'updated'; orgId: string; fromUserId: string; toUserId: string }
	| { status: 'organization_not_found' }
	| { status: 'name_mismatch' }
	| { status: 'target_not_member' }
	| { status: 'already_owner' }
	| { status: 'no_current_owner' }
	| { status: 'demotion_failed' }
	| { status: 'promotion_failed' }
	| { status: 'rollback_failed' };

export interface PlatformMembershipAdministration {
	listMembers(orgId: string): Promise<PlatformOrganizationMember[]>;
	makeAdmin(input: { orgId: string; targetUserId: string }): Promise<PlatformMakeAdminResult>;
	transferOwnership(input: {
		orgId: string;
		targetUserId: string;
		confirmName: string;
	}): Promise<PlatformTransferOwnershipResult>;
}

export function createPlatformMembershipAdministration(
	deps: PlatformMembershipAdministrationDependencies
): PlatformMembershipAdministration {
	return {
		listMembers(orgId) {
			return deps.store.listMembers(orgId);
		},

		async makeAdmin(input) {
			const membership = await deps.store.getMembership({ orgId: input.orgId, userId: input.targetUserId });
			if (!membership) return { status: 'target_not_member' };
			if (membership.role === 'owner') return { status: 'already_owner' };
			if (membership.role === 'admin') return { status: 'already_admin' };

			await deps.store.setMembershipRole({ orgId: input.orgId, userId: input.targetUserId, role: 'admin' });

			deps.audit({
				action: 'admin.org.make_admin',
				resourceType: 'organization',
				resourceId: input.orgId,
				orgId: input.orgId,
				details: { targetUserId: input.targetUserId, previousRole: membership.role },
				severity: 'warning'
			});

			return { status: 'updated', orgId: input.orgId, targetUserId: input.targetUserId };
		},

		async transferOwnership(input) {
			const org = await deps.store.getOrganization(input.orgId);
			if (!org) return { status: 'organization_not_found' };
			if (input.confirmName !== org.name) return { status: 'name_mismatch' };

			const targetMembership = await deps.store.getMembership({ orgId: input.orgId, userId: input.targetUserId });
			if (!targetMembership) return { status: 'target_not_member' };
			if (targetMembership.role === 'owner') return { status: 'already_owner' };

			const currentOwner = await deps.store.getCurrentOwner(input.orgId);
			if (!currentOwner) return { status: 'no_current_owner' };

			try {
				await deps.store.setMembershipRole({ orgId: input.orgId, userId: currentOwner.userId, role: 'admin' });
			} catch {
				return { status: 'demotion_failed' };
			}

			try {
				await deps.store.setMembershipRole({ orgId: input.orgId, userId: input.targetUserId, role: 'owner' });
			} catch (promotionError) {
				try {
					await deps.store.setMembershipRole({ orgId: input.orgId, userId: currentOwner.userId, role: 'owner' });
				} catch (rollbackError) {
					console.error('[admin] Platform ownership transfer rollback failed:', {
						orgId: input.orgId,
						currentOwnerUserId: currentOwner.userId,
						targetUserId: input.targetUserId,
						promotionError,
						rollbackError
					});
					return { status: 'rollback_failed' };
				}
				return { status: 'promotion_failed' };
			}

			deps.audit({
				action: 'transfer_org_ownership',
				resourceType: 'organization',
				resourceId: input.orgId,
				orgId: input.orgId,
				details: {
					fromUserId: currentOwner.userId,
					toUserId: input.targetUserId,
					orgName: org.name
				},
				severity: 'critical'
			});

			return {
				status: 'updated',
				orgId: input.orgId,
				fromUserId: currentOwner.userId,
				toUserId: input.targetUserId
			};
		}
	};
}
