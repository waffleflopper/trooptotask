import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { OwnershipTransferCandidate } from './ownershipTransferSettings';

interface MembershipRow {
	id: string;
	user_id: string | null;
	email: string | null;
	role: MembershipRole;
}

interface OwnershipTransferSettingsContext {
	auth: { orgId: string; role: MembershipRole };
	store: {
		findMany<T>(table: string, orgId: string, filters: undefined, options: { select: string }): Promise<T[]>;
	};
}

export async function loadOwnershipTransferCandidates(
	ctx: OwnershipTransferSettingsContext
): Promise<OwnershipTransferCandidate[]> {
	if (ctx.auth.role !== 'owner') return [];

	const members = await ctx.store.findMany<MembershipRow>('organization_memberships', ctx.auth.orgId, undefined, {
		select: 'id, user_id, email, role'
	});

	return members.flatMap((member) => {
		if (member.role === 'owner' || !member.user_id || !member.email?.trim()) return [];
		return [
			{
				id: member.id,
				userId: member.user_id,
				email: member.email,
				membershipRole: member.role
			}
		];
	});
}
