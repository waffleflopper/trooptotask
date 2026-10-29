import { scopeTree, type ScopeTree } from './scopeGroups';
import {
	TARGET_MEMBER_PRESET_CAPABILITIES,
	type CapabilityLevel,
	type CapabilityMap,
	type DurableFeatureLane,
	type MemberPreset,
	type ScopeSet,
	type StoredMemberPreset
} from '$lib/access/memberAccessShape';
import { defaultMemberAccessForRole } from '$lib/access/memberAccessCommands';
import type { ScopeGroup, SettingsMemberRow } from './memberSettingsTypes';
import {
	CAPABILITY_LEVEL_LABELS,
	SETTINGS_ACCESS_LANES,
	SETTINGS_ACCESS_OPTIONS,
	SETTINGS_GOVERNANCE_ROLE_OPTIONS,
	type EditableMembershipRole,
	type EditablePreset
} from './settingsMemberAccessConstants';

export type { EditableMembershipRole, EditablePreset };

export interface SettingsMemberAccessData {
	members: SettingsMemberRow[];
	groups: ScopeGroup[];
	isOwner: boolean;
	/** Lanes whose feature the unit turned off. Their stored level is shown and kept, never edited. */
	offLanes: DurableFeatureLane[];
}

/** The Manage access sheet edits one member at a time; the draft is that member's access as it would save. */
export interface MemberAccessDraft {
	memberId: string;
	role: EditableMembershipRole;
	preset: EditablePreset;
	levels: CapabilityMap;
	scope: ScopeSet;
}

export interface InviteDraft {
	email: string;
	role: EditableMembershipRole;
	preset: EditablePreset;
	/** Empty means every group. */
	groupIds: string[];
}

export const ALL_GROUPS = 'all';

const PRESET_LABELS: Record<MemberPreset, string> = {
	editor: 'Editor',
	operator: 'Operator',
	viewer: 'Viewer',
	custom: 'Custom'
};

export function accessLabel(member: Pick<SettingsMemberRow, 'membershipRole' | 'access'>): string {
	if (member.membershipRole === 'owner') return 'Owner';
	if (member.membershipRole === 'admin') return 'Admin';
	return PRESET_LABELS[member.access.memberPreset];
}

export function presetLabel(preset: EditablePreset): string {
	return PRESET_LABELS[preset];
}

export function presetHelper(preset: EditablePreset): string {
	return SETTINGS_ACCESS_OPTIONS.find((option) => option.value === preset)?.helper ?? '';
}

export function roleHelper(role: EditableMembershipRole): string {
	return SETTINGS_GOVERNANCE_ROLE_OPTIONS.find((option) => option.value === role)?.helper ?? '';
}

export function memberInitials(email: string | null | undefined): string {
	return (email?.trim() || 'Member')
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join('');
}

/** An Admin save stores the default access, whatever the sheet showed before the role changed. */
function adminDraft(memberId: string): MemberAccessDraft {
	const { memberPreset, scopeSet } = defaultMemberAccessForRole('admin');
	return {
		memberId,
		role: 'admin',
		preset: memberPreset,
		levels: TARGET_MEMBER_PRESET_CAPABILITIES[memberPreset],
		scope: scopeSet
	};
}

function editablePreset(memberPreset: MemberPreset): StoredMemberPreset {
	return memberPreset === 'custom' ? 'editor' : memberPreset;
}

/** A lane whose feature is off shows the level on file, which differs from the projection for an Admin. */
function savedDraft(member: SettingsMemberRow, offLanes: readonly DurableFeatureLane[]): MemberAccessDraft {
	return {
		memberId: member.id,
		role: member.membershipRole === 'admin' ? 'admin' : 'member',
		preset: editablePreset(member.access.memberPreset),
		levels: Object.fromEntries(
			SETTINGS_ACCESS_LANES.map(({ id }) => [
				id,
				offLanes.includes(id) ? member.storedLevels[id] : member.access.capabilityMap[id]
			])
		) as CapabilityMap,
		scope:
			member.access.scopeSet.kind === 'groups'
				? { kind: 'groups', groupIds: [...member.access.scopeSet.groupIds] }
				: { kind: 'organization' }
	};
}

function sameScope(a: ScopeSet, b: ScopeSet): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'organization' || b.kind === 'organization') return true;
	return [...a.groupIds].sort().join(',') === [...b.groupIds].sort().join(',');
}

export class SettingsMemberAccessWorkspace {
	readonly #getData: () => SettingsMemberAccessData;

	draft = $state<MemberAccessDraft | null>(null);
	invite = $state<InviteDraft>({ email: '', role: 'member', preset: 'editor', groupIds: [] });
	filter = $state('');
	readonly #tree = $derived(scopeTree(this.#data.groups));

	constructor(data: SettingsMemberAccessData | (() => SettingsMemberAccessData)) {
		this.#getData = typeof data === 'function' ? data : () => data;
	}

	/** The Groups a scope can cover, as a tree. */
	get scopeTree(): ScopeTree {
		return this.#tree;
	}

	get #data(): SettingsMemberAccessData {
		return this.#getData();
	}

	/** The owner first, then everyone by email. */
	get members(): SettingsMemberRow[] {
		return [...this.#data.members].sort((a, b) => {
			if (a.membershipRole === 'owner' && b.membershipRole !== 'owner') return -1;
			if (b.membershipRole === 'owner' && a.membershipRole !== 'owner') return 1;
			return (a.email ?? '').localeCompare(b.email ?? '', undefined, { sensitivity: 'base' });
		});
	}

	get visibleMembers(): SettingsMemberRow[] {
		const query = this.filter.trim().toLowerCase();
		const members = this.members;
		return query ? members.filter((member) => (member.email ?? '').toLowerCase().includes(query)) : members;
	}

	get editingMember(): SettingsMemberRow | null {
		const draft = this.draft;
		return draft ? (this.#data.members.find((member) => member.id === draft.memberId) ?? null) : null;
	}

	isOff(lane: DurableFeatureLane): boolean {
		return this.#data.offLanes.includes(lane);
	}

	groupName(groupId: string): string {
		return this.#tree.path(groupId);
	}

	open(member: SettingsMemberRow): void {
		if (member.membershipRole === 'owner') return;
		this.draft = savedDraft(member, this.#data.offLanes);
	}

	close(): void {
		this.draft = null;
	}

	setRole(role: EditableMembershipRole): void {
		if (this.draft && this.#data.isOwner) this.draft.role = role;
	}

	/** A preset rewrites every lane the unit has on; returning to the saved preset restores the saved levels. */
	setPreset(preset: EditablePreset): void {
		const member = this.editingMember;
		if (!this.draft || !member) return;
		const saved = savedDraft(member, this.#data.offLanes);
		const levels = preset === saved.preset ? saved.levels : TARGET_MEMBER_PRESET_CAPABILITIES[preset];
		this.draft.preset = preset;
		this.draft.levels = Object.fromEntries(
			SETTINGS_ACCESS_LANES.map(({ id }) => [id, this.isOff(id) ? saved.levels[id] : levels[id]])
		) as CapabilityMap;
	}

	setLevel(lane: DurableFeatureLane, level: CapabilityLevel): void {
		if (this.draft && !this.isOff(lane)) this.draft.levels[lane] = level;
	}

	setScopeKind(kind: ScopeSet['kind']): void {
		if (!this.draft || this.draft.scope.kind === kind) return;
		this.draft.scope = kind === 'groups' ? { kind: 'groups', groupIds: [] } : { kind: 'organization' };
	}

	/** Stores the roots of the selection: a squad covers its teams, so the teams are not listed again. */
	setScopeGroups(groupIds: readonly string[]): void {
		const scope = this.draft?.scope;
		if (scope?.kind === 'groups') scope.groupIds = this.#tree.canonical(groupIds);
	}

	/** "<preset> gives <level>" for a lane that differs from the chosen preset, or null when it matches or is off. */
	presetGap(lane: DurableFeatureLane): string | null {
		const draft = this.draft;
		if (!draft || this.isOff(lane)) return null;
		const presetLevel = TARGET_MEMBER_PRESET_CAPABILITIES[draft.preset][lane];
		return draft.levels[lane] === presetLevel
			? null
			: `${presetLabel(draft.preset)} gives ${CAPABILITY_LEVEL_LABELS[presetLevel]}`;
	}

	get areaChangeCount(): number {
		return SETTINGS_ACCESS_LANES.filter(({ id }) => this.presetGap(id) !== null).length;
	}

	/** One change each for role, preset, scope, and every lane the save moves. The server keeps off lanes as stored. */
	get changeCount(): number {
		const member = this.editingMember;
		const draft = this.draft;
		if (!draft || !member) return 0;
		const saved = savedDraft(member, this.#data.offLanes);
		const next = draft.role === 'admin' ? adminDraft(draft.memberId) : draft;
		return [
			next.role !== saved.role,
			next.preset !== saved.preset,
			!sameScope(next.scope, saved.scope),
			...SETTINGS_ACCESS_LANES.map(({ id }) => !this.isOff(id) && next.levels[id] !== saved.levels[id])
		].filter(Boolean).length;
	}

	/** The groups picker offers "Whole unit" beside the tree; picking it clears the rest, and clearing the rest picks it. */
	setInviteGroups(values: readonly string[]): void {
		const hadAll = this.invite.groupIds.length === 0;
		const groupIds = this.#tree.canonical(values.filter((value) => value !== ALL_GROUPS));
		this.invite.groupIds = !hadAll && values.includes(ALL_GROUPS) ? [] : groupIds;
	}

	get inviteGroupsValue(): string[] {
		return this.invite.groupIds.length === 0 ? [ALL_GROUPS] : this.invite.groupIds;
	}

	get inviteGroupsLabel(): string {
		const ids = this.invite.groupIds;
		if (ids.length === 0) return 'Whole unit';
		return ids.length === 1 ? this.groupName(ids[0]) : `${ids.length} Groups`;
	}

	resetInvite(): void {
		this.invite = { email: '', role: 'member', preset: this.invite.preset, groupIds: [] };
	}
}

export function createSettingsMemberAccessWorkspace(
	data: SettingsMemberAccessData | (() => SettingsMemberAccessData)
): SettingsMemberAccessWorkspace {
	return new SettingsMemberAccessWorkspace(data);
}
