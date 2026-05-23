import type { OrganizationMemberPermissions } from '$lib/types';
import {
	DURABLE_FEATURE_LANES,
	isCapabilityLevel,
	serializeScopeSetForStorage,
	targetMemberAccessToCurrentPermissionFlags,
	targetMemberAccessToStorage,
	type CapabilityOverrideMap,
	type MembershipRole,
	type ScopeSet,
	type StoredMemberPreset
} from './memberAccessShape';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EditableMembershipRole = Exclude<MembershipRole, 'owner'>;

export interface TargetMemberAccessCommand {
	memberPreset: StoredMemberPreset;
	capabilityOverrides: CapabilityOverrideMap;
	scopeSet: ScopeSet;
	canManageMembers?: boolean;
}

export interface MemberAccessEditCommand {
	membershipRole: EditableMembershipRole;
	memberAccess: TargetMemberAccessCommand;
}

export interface MemberAccessStorageCommand {
	role: EditableMembershipRole;
	singleGroupCompatibilityId: string | null;
	permissions: OrganizationMemberPermissions;
	memberPreset: StoredMemberPreset;
	capabilityOverrides: CapabilityOverrideMap;
	accessScopeKind: ScopeSet['kind'];
	accessScopeGroupIds: string[];
}

export function parseMemberAccessEditFormData(formData: FormData): MemberAccessEditCommand {
	const membershipRole = parseEditableMembershipRole(formData.get('membershipRole'));

	if (membershipRole === 'admin') {
		return {
			membershipRole,
			memberAccess: defaultMemberAccessForRole(membershipRole)
		};
	}

	return {
		membershipRole,
		memberAccess: {
			memberPreset: parseStoredMemberPreset(formData.get('memberPreset')),
			capabilityOverrides: parseCapabilityOverrides(formData),
			scopeSet: parseScopeSet(formData)
		}
	};
}

export function memberAccessCommandToStorage(command: {
	membershipRole: EditableMembershipRole;
	memberAccess?: TargetMemberAccessCommand | null;
}): MemberAccessStorageCommand {
	const memberAccess =
		command.memberAccess ??
		(command.membershipRole === 'admin'
			? defaultMemberAccessForRole(command.membershipRole)
			: throwBadRequest('Member preset is required'));
	const scopeSet = normalizeScopeSet(memberAccess.scopeSet);
	const permissions = targetMemberAccessToCurrentPermissionFlags({
		membershipRole: command.membershipRole,
		memberPreset: memberAccess.memberPreset,
		capabilityOverrides: memberAccess.capabilityOverrides,
		scopeSet,
		canManageMembers: memberAccess.canManageMembers
	});
	const accessStorage = targetMemberAccessToStorage({
		membershipRole: command.membershipRole,
		memberPreset: memberAccess.memberPreset,
		capabilityOverrides: memberAccess.capabilityOverrides,
		scopeSet,
		canManageMembers: memberAccess.canManageMembers
	});
	const serializedScope = serializeScopeSetForStorage(accessStorage.scopeSet);

	return {
		role: command.membershipRole,
		singleGroupCompatibilityId: serializedScope.access_scope_group_ids[0] ?? null,
		permissions,
		memberPreset: accessStorage.memberPreset,
		capabilityOverrides: accessStorage.capabilityOverrides,
		accessScopeKind: serializedScope.access_scope_kind,
		accessScopeGroupIds: serializedScope.access_scope_group_ids
	};
}

export function defaultMemberAccessForRole(role: EditableMembershipRole): TargetMemberAccessCommand {
	switch (role) {
		case 'admin':
		case 'member':
			return {
				memberPreset: 'editor',
				capabilityOverrides: {},
				scopeSet: { kind: 'organization' }
			};
	}
}

function parseEditableMembershipRole(value: FormDataEntryValue | null): EditableMembershipRole {
	return value === 'admin' ? 'admin' : 'member';
}

function parseStoredMemberPreset(value: FormDataEntryValue | null): StoredMemberPreset {
	if (value === 'viewer' || value === 'operator' || value === 'editor') {
		return value;
	}

	throwBadRequest('Member preset is required');
}

function parseCapabilityOverrides(formData: FormData): CapabilityOverrideMap {
	const overrides: CapabilityOverrideMap = {};
	for (const lane of DURABLE_FEATURE_LANES) {
		const value = formData.get(`capabilityOverride:${lane}`);
		if (isCapabilityLevel(value)) {
			overrides[lane] = value;
		}
	}
	return overrides;
}

function parseScopeSet(formData: FormData): ScopeSet {
	if (formData.get('scopeSetKind') !== 'groups') {
		return { kind: 'organization' };
	}

	const groupIds = Array.from(
		new Set(
			formData.getAll('scopeSetGroupIds').filter((value): value is string => typeof value === 'string' && isUuid(value))
		)
	);
	return groupIds.length > 0 ? { kind: 'groups', groupIds } : { kind: 'organization' };
}

function normalizeScopeSet(scopeSet: ScopeSet): ScopeSet {
	if (scopeSet.kind !== 'groups') {
		return { kind: 'organization' };
	}

	const groupIds = Array.from(new Set(scopeSet.groupIds.filter(isUuid)));
	return groupIds.length > 0 ? { kind: 'groups', groupIds } : { kind: 'organization' };
}

function isUuid(value: string): boolean {
	return UUID_REGEX.test(value);
}

function throwBadRequest(message: string): never {
	throw Object.assign(new Error(message), { status: 400 });
}
