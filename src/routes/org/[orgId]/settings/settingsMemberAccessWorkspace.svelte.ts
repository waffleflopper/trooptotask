import {
	TARGET_MEMBER_PRESET_CAPABILITIES,
	type CapabilityLevel,
	type DurableFeatureLane,
	type MemberPreset,
	type ScopeSet,
	type StoredMemberPreset
} from '$lib/access/memberAccessShape';
import type {
	SettingsAccessShape,
	SettingsInvitationAccessRow,
	SettingsMemberAccessRow
} from './settingsMemberAccessModel';
import {
	SETTINGS_ACCESS_LANES,
	SETTINGS_ACCESS_OPTIONS,
	SETTINGS_GOVERNANCE_ROLE_OPTIONS,
	SETTINGS_CAPABILITY_OPTIONS,
	type AccessLaneConfig,
	type AccessOption,
	type EditablePreset,
	type EditableMembershipRole,
	type GovernanceRoleOption
} from './settingsMemberAccessConstants';

export type MemberAccessBadge = MemberPreset | 'admin' | 'owner';
export type ScopeKind = ScopeSet['kind'];
export type { AccessLaneConfig, AccessOption, EditablePreset, EditableMembershipRole, GovernanceRoleOption };

export interface SettingsMemberAccessData {
	members: SettingsMemberAccessRow[];
	invitations: SettingsInvitationAccessRow[];
	groups: Array<{ id: string; name: string }>;
	isOwner: boolean;
}

export class SettingsMemberAccessWorkspace {
	readonly #getData: () => SettingsMemberAccessData;

	memberEditorId = $state<string | null>(null);
	inviteEmail = $state('');
	inviteMembershipRole = $state<EditableMembershipRole>('member');
	invitePreset = $state<EditablePreset>('editor');
	inviteScopeKind = $state<ScopeKind>('organization');
	inviteScopeGroupIds = $state<string[]>([]);
	memberSelectedMembershipRole = $state<Record<string, EditableMembershipRole>>({});
	memberSelectedPreset = $state<Record<string, EditablePreset>>({});
	memberSelectedCapabilities = $state<Record<string, Partial<Record<DurableFeatureLane, CapabilityLevel>>>>({});
	memberSelectedScopeKind = $state<Record<string, ScopeKind>>({});
	memberSelectedScopeGroupIds = $state<Record<string, string[]>>({});

	constructor(data: SettingsMemberAccessData | (() => SettingsMemberAccessData)) {
		this.#getData = typeof data === 'function' ? data : () => data;
	}

	get #data(): SettingsMemberAccessData {
		return this.#getData();
	}

	get sortedMembers(): SettingsMemberAccessRow[] {
		return [...this.#data.members].sort((a, b) => {
			if (a.membershipRole === 'owner' && b.membershipRole !== 'owner') return -1;
			if (b.membershipRole === 'owner' && a.membershipRole !== 'owner') return 1;
			return (a.email ?? '').localeCompare(b.email ?? '', undefined, { sensitivity: 'base' });
		});
	}

	get availablePresetOptions(): AccessOption[] {
		return SETTINGS_ACCESS_OPTIONS;
	}

	get availableMembershipRoleOptions(): GovernanceRoleOption[] {
		return this.#data.isOwner
			? SETTINGS_GOVERNANCE_ROLE_OPTIONS
			: SETTINGS_GOVERNANCE_ROLE_OPTIONS.filter((option) => option.value === 'member');
	}

	get accessLanes(): AccessLaneConfig[] {
		return SETTINGS_ACCESS_LANES;
	}

	get capabilityOptions(): Array<{ value: CapabilityLevel; label: string }> {
		return SETTINGS_CAPABILITY_OPTIONS;
	}

	getMemberInitials(email: string | null | undefined): string {
		const fallback = email?.trim() || 'Member';
		return fallback
			.split(/[^a-zA-Z0-9]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('');
	}

	getGroupName(groupId: string | null | undefined): string | null {
		if (!groupId) return null;
		return this.#data.groups.find((group) => group.id === groupId)?.name ?? 'Unknown group';
	}

	getInvitePreset(invite: SettingsInvitationAccessRow): MemberAccessBadge {
		if (invite.membershipRole === 'admin') return 'admin';
		return invite.access.memberPreset;
	}

	getMemberAccessBadge(member: SettingsMemberAccessRow, accessShape: SettingsAccessShape): MemberAccessBadge {
		if (member.membershipRole === 'owner') return 'owner';
		if (member.membershipRole === 'admin') return 'admin';
		return accessShape.memberPreset;
	}

	getAccessLabel(memberPreset: MemberAccessBadge): string {
		switch (memberPreset) {
			case 'owner':
				return 'Owner';
			case 'admin':
				return 'Admin';
			case 'editor':
				return 'Editor';
			case 'operator':
				return 'Operator';
			case 'viewer':
				return 'Viewer';
			case 'custom':
				return 'Custom';
			default:
				return memberPreset;
		}
	}

	getAccessOptionHelper(preset: EditablePreset): string {
		return SETTINGS_ACCESS_OPTIONS.find((option) => option.value === preset)?.helper ?? '';
	}

	getGovernanceRoleHelper(role: EditableMembershipRole): string {
		return SETTINGS_GOVERNANCE_ROLE_OPTIONS.find((option) => option.value === role)?.helper ?? '';
	}

	getGovernanceRoleLabel(role: EditableMembershipRole): string {
		return SETTINGS_GOVERNANCE_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? 'Member';
	}

	editablePresetForMemberPreset(memberPreset: MemberPreset): StoredMemberPreset {
		return memberPreset === 'viewer' || memberPreset === 'operator' || memberPreset === 'editor'
			? memberPreset
			: 'editor';
	}

	getMemberAccessShape(member: SettingsMemberAccessRow): SettingsAccessShape {
		return member.access;
	}

	formatScopeSet(scopeSet: ScopeSet): string {
		if (scopeSet.kind === 'organization') return 'All groups';
		return scopeSet.groupIds.map((groupId) => this.getGroupName(groupId) ?? 'Unknown group').join(', ');
	}

	formatCapability(level: CapabilityLevel): string {
		return SETTINGS_CAPABILITY_OPTIONS.find((option) => option.value === level)?.label ?? level;
	}

	overriddenCapabilityLabels(member: SettingsMemberAccessRow): string[] {
		const shape = this.getMemberAccessShape(member);
		const memberPreset = this.editablePresetForMemberPreset(shape.memberPreset);
		return SETTINGS_ACCESS_LANES.filter(
			(lane) => shape.capabilityMap[lane.id] !== TARGET_MEMBER_PRESET_CAPABILITIES[memberPreset][lane.id]
		).map((lane) => `${lane.label}: ${this.formatCapability(shape.capabilityMap[lane.id])}`);
	}

	getEditorCapabilityValue(
		member: SettingsMemberAccessRow,
		lane: DurableFeatureLane,
		selectedPreset: EditablePreset
	): CapabilityLevel {
		const selectedCapability = this.memberSelectedCapabilities[member.id]?.[lane];
		if (selectedCapability) return selectedCapability;

		const accessShape = this.getMemberAccessShape(member);
		const currentPreset = this.editablePresetForMemberPreset(accessShape.memberPreset);
		if (selectedPreset !== currentPreset) {
			return TARGET_MEMBER_PRESET_CAPABILITIES[selectedPreset][lane];
		}

		return accessShape.capabilityMap[lane];
	}

	getSelectedMembershipRole(member: SettingsMemberAccessRow): EditableMembershipRole {
		return this.memberSelectedMembershipRole[member.id] ?? (member.membershipRole === 'admin' ? 'admin' : 'member');
	}

	getSelectedPreset(member: SettingsMemberAccessRow): EditablePreset {
		const accessShape = this.getMemberAccessShape(member);
		return this.memberSelectedPreset[member.id] ?? this.editablePresetForMemberPreset(accessShape.memberPreset);
	}

	getSelectedScopeKind(member: SettingsMemberAccessRow): ScopeKind {
		return this.memberSelectedScopeKind[member.id] ?? this.getMemberAccessShape(member).scopeSet.kind;
	}

	getSelectedScopeGroupIds(member: SettingsMemberAccessRow): string[] {
		const current = this.getMemberAccessShape(member).scopeSet;
		return this.memberSelectedScopeGroupIds[member.id] ?? (current.kind === 'groups' ? current.groupIds : []);
	}

	openMemberEditor(member: SettingsMemberAccessRow): void {
		if (member.membershipRole === 'owner') return;
		const accessShape = this.getMemberAccessShape(member);
		const scopeGroupIds = accessShape.scopeSet.kind === 'groups' ? accessShape.scopeSet.groupIds : [];
		this.memberEditorId = member.id;
		this.memberSelectedMembershipRole = {
			...this.memberSelectedMembershipRole,
			[member.id]: member.membershipRole === 'admin' ? 'admin' : 'member'
		};
		this.memberSelectedPreset = {
			...this.memberSelectedPreset,
			[member.id]: this.editablePresetForMemberPreset(accessShape.memberPreset)
		};
		const remainingCapabilities = { ...this.memberSelectedCapabilities };
		delete remainingCapabilities[member.id];
		this.memberSelectedCapabilities = remainingCapabilities;
		this.memberSelectedScopeKind = {
			...this.memberSelectedScopeKind,
			[member.id]: accessShape.scopeSet.kind
		};
		this.memberSelectedScopeGroupIds = {
			...this.memberSelectedScopeGroupIds,
			[member.id]: scopeGroupIds
		};
	}

	closeMemberEditor(memberId: string): void {
		this.memberEditorId = null;
		const remainingRoles = { ...this.memberSelectedMembershipRole };
		const remainingPresets = { ...this.memberSelectedPreset };
		const remainingCapabilities = { ...this.memberSelectedCapabilities };
		const remainingScopeKinds = { ...this.memberSelectedScopeKind };
		const remainingScopeGroups = { ...this.memberSelectedScopeGroupIds };
		delete remainingRoles[memberId];
		delete remainingPresets[memberId];
		delete remainingCapabilities[memberId];
		delete remainingScopeKinds[memberId];
		delete remainingScopeGroups[memberId];
		this.memberSelectedMembershipRole = remainingRoles;
		this.memberSelectedPreset = remainingPresets;
		this.memberSelectedCapabilities = remainingCapabilities;
		this.memberSelectedScopeKind = remainingScopeKinds;
		this.memberSelectedScopeGroupIds = remainingScopeGroups;
	}

	setMemberMembershipRole(memberId: string, role: EditableMembershipRole): void {
		this.memberSelectedMembershipRole = {
			...this.memberSelectedMembershipRole,
			[memberId]: role
		};
	}

	setMemberPreset(memberId: string, preset: EditablePreset): void {
		this.memberSelectedPreset = {
			...this.memberSelectedPreset,
			[memberId]: preset
		};
	}

	setMemberScopeKind(memberId: string, scopeKind: ScopeKind): void {
		this.memberSelectedScopeKind = {
			...this.memberSelectedScopeKind,
			[memberId]: scopeKind
		};
	}

	setMemberCapability(memberId: string, lane: DurableFeatureLane, capability: CapabilityLevel): void {
		this.memberSelectedCapabilities = {
			...this.memberSelectedCapabilities,
			[memberId]: {
				...this.memberSelectedCapabilities[memberId],
				[lane]: capability
			}
		};
	}

	toggleMemberScopeGroup(memberId: string, groupId: string, checked: boolean): void {
		const current = this.memberSelectedScopeGroupIds[memberId] ?? [];
		const next = checked
			? current.includes(groupId)
				? current
				: [...current, groupId]
			: current.filter((id) => id !== groupId);
		this.memberSelectedScopeGroupIds = { ...this.memberSelectedScopeGroupIds, [memberId]: next };
	}

	setInviteScopeKind(scopeKind: ScopeKind): void {
		this.inviteScopeKind = scopeKind;
	}

	setInviteMembershipRole(role: EditableMembershipRole): void {
		this.inviteMembershipRole = role;
	}

	isRoleChanged(member: SettingsMemberAccessRow): boolean {
		const saved: EditableMembershipRole = member.membershipRole === 'admin' ? 'admin' : 'member';
		return this.getSelectedMembershipRole(member) !== saved;
	}

	isPresetChanged(member: SettingsMemberAccessRow): boolean {
		const saved = this.editablePresetForMemberPreset(member.access.memberPreset);
		return this.getSelectedPreset(member) !== saved;
	}

	isCapabilityChanged(member: SettingsMemberAccessRow, lane: DurableFeatureLane): boolean {
		const saved = member.access.capabilityMap[lane];
		const selected = this.getEditorCapabilityValue(member, lane, this.getSelectedPreset(member));
		return selected !== saved;
	}

	isScopeChanged(member: SettingsMemberAccessRow): boolean {
		const savedKind = this.getMemberAccessShape(member).scopeSet.kind;
		const selectedKind = this.getSelectedScopeKind(member);
		if (savedKind !== selectedKind) return true;
		if (selectedKind === 'groups') {
			const savedSet = this.getMemberAccessShape(member).scopeSet;
			const savedGroupIds = savedSet.kind === 'groups' ? [...savedSet.groupIds].sort() : [];
			const selectedGroupIds = [...this.getSelectedScopeGroupIds(member)].sort();
			return savedGroupIds.join(',') !== selectedGroupIds.join(',');
		}
		return false;
	}

	editorChangeCount(member: SettingsMemberAccessRow): number {
		let count = 0;
		const roleChanged = this.isRoleChanged(member);
		if (roleChanged) count++;
		const selectedRole = this.getSelectedMembershipRole(member);
		if (selectedRole === 'member') {
			if (this.isPresetChanged(member)) count++;
			if (!roleChanged) {
				for (const lane of SETTINGS_ACCESS_LANES) {
					if (this.isCapabilityChanged(member, lane.id)) count++;
				}
			}
			if (this.isScopeChanged(member)) count++;
		}
		return count;
	}

	toggleInviteScopeGroup(groupId: string, checked: boolean): void {
		this.inviteScopeGroupIds = checked
			? this.inviteScopeGroupIds.includes(groupId)
				? this.inviteScopeGroupIds
				: [...this.inviteScopeGroupIds, groupId]
			: this.inviteScopeGroupIds.filter((id) => id !== groupId);
	}

	clearInviteEmail(): void {
		this.inviteEmail = '';
		this.inviteMembershipRole = 'member';
		this.inviteScopeKind = 'organization';
		this.inviteScopeGroupIds = [];
	}
}

export function createSettingsMemberAccessWorkspace(
	data: SettingsMemberAccessData | (() => SettingsMemberAccessData)
): SettingsMemberAccessWorkspace {
	return new SettingsMemberAccessWorkspace(data);
}
