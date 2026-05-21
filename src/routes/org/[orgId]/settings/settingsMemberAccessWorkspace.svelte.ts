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
	SETTINGS_CAPABILITY_OPTIONS,
	type AccessLaneConfig,
	type AccessOption,
	type EditablePreset
} from './settingsMemberAccessConstants';

export type MemberAccessBadge = MemberPreset | 'admin' | 'owner';
export type ScopeKind = ScopeSet['kind'];
export type { AccessLaneConfig, AccessOption, EditablePreset };

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
	invitePreset = $state<EditablePreset>('editor');
	inviteScopeKind = $state<ScopeKind>('organization');
	inviteScopeGroupIds = $state<string[]>([]);
	memberSelectedPreset = $state<Record<string, EditablePreset>>({});
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
		return this.#data.isOwner
			? SETTINGS_ACCESS_OPTIONS
			: SETTINGS_ACCESS_OPTIONS.filter((option) => option.value !== 'admin');
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
				return 'Admin governance';
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
		return level[0].toUpperCase() + level.slice(1);
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
		const accessShape = this.getMemberAccessShape(member);
		if (selectedPreset === 'admin') return TARGET_MEMBER_PRESET_CAPABILITIES.editor[lane];

		const currentPreset = this.editablePresetForMemberPreset(accessShape.memberPreset);
		if (selectedPreset !== currentPreset) {
			return TARGET_MEMBER_PRESET_CAPABILITIES[selectedPreset][lane];
		}

		return accessShape.capabilityMap[lane];
	}

	getSelectedPreset(member: SettingsMemberAccessRow): EditablePreset {
		const accessShape = this.getMemberAccessShape(member);
		return (
			this.memberSelectedPreset[member.id] ??
			(member.membershipRole === 'admin' ? 'admin' : this.editablePresetForMemberPreset(accessShape.memberPreset))
		);
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
		this.memberSelectedPreset = {
			...this.memberSelectedPreset,
			[member.id]:
				member.membershipRole === 'admin' ? 'admin' : this.editablePresetForMemberPreset(accessShape.memberPreset)
		};
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
		const remainingPresets = { ...this.memberSelectedPreset };
		const remainingScopeKinds = { ...this.memberSelectedScopeKind };
		const remainingScopeGroups = { ...this.memberSelectedScopeGroupIds };
		delete remainingPresets[memberId];
		delete remainingScopeKinds[memberId];
		delete remainingScopeGroups[memberId];
		this.memberSelectedPreset = remainingPresets;
		this.memberSelectedScopeKind = remainingScopeKinds;
		this.memberSelectedScopeGroupIds = remainingScopeGroups;
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

	toggleInviteScopeGroup(groupId: string, checked: boolean): void {
		this.inviteScopeGroupIds = checked
			? this.inviteScopeGroupIds.includes(groupId)
				? this.inviteScopeGroupIds
				: [...this.inviteScopeGroupIds, groupId]
			: this.inviteScopeGroupIds.filter((id) => id !== groupId);
	}

	clearInviteEmail(): void {
		this.inviteEmail = '';
		this.inviteScopeKind = 'organization';
		this.inviteScopeGroupIds = [];
	}
}

export function createSettingsMemberAccessWorkspace(
	data: SettingsMemberAccessData | (() => SettingsMemberAccessData)
): SettingsMemberAccessWorkspace {
	return new SettingsMemberAccessWorkspace(data);
}
