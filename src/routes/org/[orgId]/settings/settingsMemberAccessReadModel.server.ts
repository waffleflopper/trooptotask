import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	projectEffectiveInvitationAccess,
	projectEffectiveMemberAccess,
	type EffectiveMemberAccessProjection,
	type MemberAccessPresentationRow,
	type MemberAccessProjectionRow
} from '$lib/access/memberAccessProjection';
import type { MembershipRole } from '$lib/access/memberAccessShape';
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
	const projection = projectEffectiveInvitationAccess(row);
	return {
		id: asString(row.id),
		email: asString(row.email),
		status: asString(row.status),
		membershipRole: projection.role,
		createdAt: asString(row.created_at),
		access: buildSettingsAccessShapeFromProjection(projection)
	};
}

export function buildSettingsAccessShape(
	row: MemberAccessPresentationRow,
	membershipRole: MembershipRole
): SettingsAccessShape {
	const projection = projectEffectiveMemberAccess({
		...row,
		role: membershipRole,
		scoped_group_id: row.scoped_group_id ?? null
	} satisfies MemberAccessProjectionRow);

	return buildSettingsAccessShapeFromProjection(projection);
}

function buildSettingsAccessShapeFromProjection(projection: EffectiveMemberAccessProjection): SettingsAccessShape {
	return {
		memberPreset: projection.memberPreset,
		capabilityMap: projection.capabilityMap,
		scopeSet: projection.scopeSet,
		organizationGovernanceActions: getOrganizationGovernanceActions(projection.role)
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
