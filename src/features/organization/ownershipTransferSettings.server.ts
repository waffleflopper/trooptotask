import type { OrganizationSettingsReader } from './contracts';
import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { OwnershipTransferCandidate } from './ownershipTransferSettings';

interface OwnershipTransferSettingsContext {
	auth: { orgId: string; role: MembershipRole };
	organizationSettings: Pick<OrganizationSettingsReader, 'listOwnershipCandidateMemberships'>;
}

export async function loadOwnershipTransferCandidates(
	ctx: OwnershipTransferSettingsContext
): Promise<OwnershipTransferCandidate[]> {
	if (ctx.auth.role !== 'owner') return [];

	const members = await ctx.organizationSettings.listOwnershipCandidateMemberships(ctx.auth.orgId);

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
