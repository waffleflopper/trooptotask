import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { UseCaseContext } from '$lib/server/core/ports';
import { normalizeOrganizationName } from '../settingsWorkspaceFormatters';
import type { DangerSettingsData, SettingsDangerSectionData } from '../settingsSectionTypes';

export interface DangerSettingsOrganizationSource {
	id: string;
	name: string | null;
	urlSlug: string | null;
	urlSegment: string;
}

export type DangerSettingsMemberSourceRow = {
	id: string;
	user_id: string | null;
	email: string;
	role: MembershipRole;
};

export async function loadDangerSettings(
	ctx: Pick<UseCaseContext, 'auth' | 'store'>,
	input: { isAdmin: boolean; organization: DangerSettingsOrganizationSource }
): Promise<DangerSettingsData> {
	const isOwner = ctx.auth.role === 'owner';
	const members = isOwner
		? await ctx.store.findMany<DangerSettingsMemberSourceRow>('organization_memberships', ctx.auth.orgId, undefined, {
				select: 'id, user_id, email, role'
			})
		: [];

	return buildDangerSettings({
		currentMemberRole: ctx.auth.role,
		canManageMembers: ctx.auth.canManageMembers,
		isAdmin: input.isAdmin,
		organization: input.organization,
		members
	});
}

export function buildDangerSettings(input: {
	currentMemberRole: MembershipRole;
	canManageMembers: boolean;
	isAdmin: boolean;
	organization: DangerSettingsOrganizationSource;
	members: DangerSettingsMemberSourceRow[];
}): DangerSettingsData {
	const isOwner = input.currentMemberRole === 'owner';
	const canManageMembers = input.canManageMembers;

	return {
		currentMember: {
			role: input.currentMemberRole,
			isOwner,
			isAdmin: input.isAdmin,
			canManageMembers
		},
		sections: {
			organization: {
				id: input.organization.id,
				name: input.organization.name,
				urlSlug: input.organization.urlSlug,
				urlSegment: input.organization.urlSegment,
				canUpdateProfile: canManageMembers,
				canUpdateUrlSlug: canManageMembers
			},
			dangerZone: buildDangerSection({
				isOwner,
				organizationName: input.organization.name,
				members: input.members
			})
		}
	};
}

export function buildDangerSection(input: {
	isOwner: boolean;
	organizationName: string | null;
	members: DangerSettingsMemberSourceRow[];
}): SettingsDangerSectionData {
	const transferOwnershipCandidates = input.isOwner
		? input.members
				.filter((member) => member.role !== 'owner' && member.user_id)
				.map((member) => ({
					id: member.id,
					userId: member.user_id!,
					email: member.email,
					membershipRole: member.role
				}))
		: [];

	return {
		transferOwnershipCandidates,
		deleteConfirmation: {
			organizationName: input.organizationName,
			normalizedOrganizationName: normalizeOrganizationName(input.organizationName ?? '')
		},
		commands: {
			canTransferOwnership: input.isOwner && transferOwnershipCandidates.length > 0,
			canDeleteOrganization: input.isOwner
		}
	};
}
