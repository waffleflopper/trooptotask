import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { UseCaseContext } from '$lib/server/core/ports';
import { loadOwnershipTransferCandidates } from '$features/organization/index.server';
import type { OwnershipTransferCandidate } from '$features/organization';
import { normalizeOrganizationName } from '../settingsWorkspaceFormatters';
import type { DangerSettingsData, SettingsDangerSectionData } from '../settingsSectionTypes';

export interface DangerSettingsOrganizationSource {
	id: string;
	name: string | null;
	urlSlug: string | null;
	urlSegment: string;
}

export async function loadDangerSettings(
	ctx: Pick<UseCaseContext, 'auth' | 'store'>,
	input: { isAdmin: boolean; organization: DangerSettingsOrganizationSource }
): Promise<DangerSettingsData> {
	const transferOwnershipCandidates = await loadOwnershipTransferCandidates(ctx);

	return buildDangerSettings({
		currentMemberRole: ctx.auth.role,
		canManageMembers: ctx.auth.canManageMembers,
		isAdmin: input.isAdmin,
		organization: input.organization,
		transferOwnershipCandidates
	});
}

export function buildDangerSettings(input: {
	currentMemberRole: MembershipRole;
	canManageMembers: boolean;
	isAdmin: boolean;
	organization: DangerSettingsOrganizationSource;
	transferOwnershipCandidates: OwnershipTransferCandidate[];
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
				transferOwnershipCandidates: input.transferOwnershipCandidates
			})
		}
	};
}

export function buildDangerSection(input: {
	isOwner: boolean;
	organizationName: string | null;
	transferOwnershipCandidates: OwnershipTransferCandidate[];
}): SettingsDangerSectionData {
	const transferOwnershipCandidates = input.isOwner ? input.transferOwnershipCandidates : [];

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
