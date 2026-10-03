import type { MembershipRole } from '$lib/access/memberAccessShape';

export interface OrganizationSupportMember {
	userId: string;
	email: string | null;
	role: MembershipRole;
}

type CommandFailure = {
	status: 'forbidden' | 'provider_error' | 'organization_not_found' | 'target_not_member' | 'already_owner';
};
export type OrganizationPromotionResult =
	| { status: 'updated'; orgId: string; targetUserId: string }
	| { status: 'already_admin' }
	| CommandFailure;
export type OrganizationTransferResult =
	| { status: 'updated'; orgId: string; fromUserId: string; toUserId: string; orgName: string }
	| { status: 'name_mismatch' | 'no_current_owner' | 'multiple_current_owners' }
	| CommandFailure;

export interface OrganizationPlatformMembershipPort {
	listMembers(orgId: string): Promise<OrganizationSupportMember[]>;
	promoteMember(input: {
		actorUserId: string;
		orgId: string;
		targetUserId: string;
	}): Promise<OrganizationPromotionResult>;
	transferOwnership(input: {
		actorUserId: string;
		orgId: string;
		targetUserId: string;
		confirmName: string;
	}): Promise<OrganizationTransferResult>;
}
