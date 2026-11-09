import type { OrganizationSettingsReader } from './contracts';
import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { OwnershipTransferCandidate } from './ownershipTransferSettings';
import { memberNameText } from './memberLabels.server';

interface OwnershipTransferSettingsContext {
	auth: { orgId: string; role: MembershipRole };
	organizationSettings: Pick<OrganizationSettingsReader, 'listOwnershipCandidateMemberships' | 'listMemberNames'>;
}

export async function loadOwnershipTransferCandidates(
	ctx: OwnershipTransferSettingsContext
): Promise<OwnershipTransferCandidate[]> {
	if (ctx.auth.role !== 'owner') return [];

	const [members, names] = await Promise.all([
		ctx.organizationSettings.listOwnershipCandidateMemberships(ctx.auth.orgId),
		ctx.organizationSettings.listMemberNames(ctx.auth.orgId)
	]);
	const nameByUserId = new Map(names.map((row) => [row.user_id, memberNameText(row) || null]));

	return members.flatMap((member) => {
		if (member.role === 'owner' || !member.user_id || !member.email?.trim()) return [];
		return [
			{
				id: member.id,
				userId: member.user_id,
				email: member.email,
				name: nameByUserId.get(member.user_id) ?? null,
				membershipRole: member.role
			}
		];
	});
}
