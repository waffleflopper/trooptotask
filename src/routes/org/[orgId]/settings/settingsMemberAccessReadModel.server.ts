import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { resolveMemberAccessShapeFromStoredOrCurrent, type MembershipRole } from '$lib/access/memberAccessShape';
import { projectMemberPermissions, type MemberAccessPresentationRow } from '$lib/access/memberAccessProjection';
import type {
	OrganizationGovernanceActionId,
	SettingsAccessShape,
	SettingsInvitationAccessRow,
	SettingsMemberAccessRow
} from './settingsMemberAccessModel';

export type LegacySettingsAccessRow = MemberAccessPresentationRow & {
	id?: unknown;
	organization_id?: unknown;
	user_id?: unknown;
	email?: unknown;
	role?: unknown;
	status?: unknown;
	created_at?: unknown;
};

export function buildSettingsMemberAccessRow(row: LegacySettingsAccessRow): SettingsMemberAccessRow {
	const membershipRole = parseMembershipRole(row.role);
	return {
		id: asString(row.id),
		organizationId: asString(row.organization_id),
		userId: asString(row.user_id),
		email: optionalString(row.email),
		membershipRole,
		createdAt: asString(row.created_at),
		access: buildSettingsAccessShape(row, membershipRole)
	};
}

export function buildSettingsInvitationAccessRow(row: LegacySettingsAccessRow): SettingsInvitationAccessRow {
	return {
		id: asString(row.id),
		email: asString(row.email),
		status: asString(row.status),
		membershipRole: 'member',
		createdAt: asString(row.created_at),
		access: buildSettingsAccessShape(row, 'member')
	};
}

export function buildSettingsAccessShape(
	row: MemberAccessPresentationRow,
	membershipRole: MembershipRole
): SettingsAccessShape {
	const permissions = projectMemberPermissions(row);
	// Fixed governance roles own privileged workspace access. Stored member-access columns remain compatibility inputs
	// for member rows, but should not make admins or owners appear group-scoped or lower than Editor in settings.
	const accessShape =
		membershipRole === 'owner' || membershipRole === 'admin'
			? resolveMemberAccessShapeFromStoredOrCurrent({
					membershipRole,
					permissions,
					scopedGroupId: null,
					memberPreset: 'editor',
					capabilityOverrides: {},
					accessScopeKind: 'organization',
					accessScopeGroupIds: []
				})
			: resolveMemberAccessShapeFromStoredOrCurrent({
					membershipRole,
					permissions,
					scopedGroupId: row.scoped_group_id ?? null,
					memberPreset: row.member_preset,
					capabilityOverrides: row.capability_overrides,
					accessScopeKind: row.access_scope_kind,
					accessScopeGroupIds: row.access_scope_group_ids
				});

	return {
		memberPreset: accessShape.memberPreset,
		capabilityMap: accessShape.capabilityMap,
		scopeSet: accessShape.scopeSet,
		organizationGovernanceActions: getOrganizationGovernanceActions(membershipRole)
	};
}

function getOrganizationGovernanceActions(membershipRole: MembershipRole): OrganizationGovernanceActionId[] {
	if (membershipRole !== 'owner' && membershipRole !== 'admin') {
		return [];
	}

	return Object.values(POLICY_ACTION_CATALOG.organization)
		.filter((action) => membershipRole === 'owner' || action.owner.access === 'admin-or-owner')
		.map((action) => action.id);
}

function parseMembershipRole(value: unknown): MembershipRole {
	if (value === 'owner' || value === 'admin') return value;
	return 'member';
}

function asString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}
