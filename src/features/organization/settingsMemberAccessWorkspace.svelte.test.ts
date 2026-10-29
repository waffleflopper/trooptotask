import { describe, expect, it } from 'vitest';
import {
	createCapabilityMap,
	type DurableFeatureLane,
	type MembershipRole,
	type MemberPreset
} from '$lib/access/memberAccessShape';
import type { SettingsMemberRow } from './memberSettingsTypes';
import { ALL_GROUPS, createSettingsMemberAccessWorkspace } from './settingsMemberAccessWorkspace.svelte';

function member(
	id: string,
	email: string,
	membershipRole: MembershipRole,
	access: Partial<SettingsMemberRow['access']> = {},
	storedLevels?: SettingsMemberRow['storedLevels']
): SettingsMemberRow {
	return {
		id,
		organizationId: 'org-1',
		userId: `user-${id}`,
		email,
		membershipRole,
		createdAt: '2026-04-01T00:00:00Z',
		access: {
			memberPreset: 'editor' as MemberPreset,
			capabilityMap: createCapabilityMap('configure'),
			scopeSet: { kind: 'organization' },
			organizationGovernanceActions: [],
			...access
		},
		storedLevels: storedLevels ?? access.capabilityMap ?? createCapabilityMap('configure'),
		scopeDisplayLabel: 'Whole unit',
		overriddenCapabilityLabels: []
	};
}

const operator = member('op', 'op@example.com', 'member', {
	memberPreset: 'operator',
	capabilityMap: { ...createCapabilityMap('operate'), training: 'view' },
	scopeSet: { kind: 'groups', groupIds: ['g-1'] }
});

function makeWorkspace(
	options: Partial<{ members: SettingsMemberRow[]; isOwner: boolean; offLanes: DurableFeatureLane[] }> = {}
) {
	return createSettingsMemberAccessWorkspace({
		members: options.members ?? [operator],
		groups: [
			{ id: 'g-1', name: 'HQ PLT' },
			{ id: 'g-2', name: '1st PLT' }
		],
		isOwner: options.isOwner ?? true,
		offLanes: options.offLanes ?? []
	});
}

describe('settings member access workspace', () => {
	it('lists the owner first, then members by email, and filters by email', () => {
		const workspace = makeWorkspace({
			members: [
				member('c', 'charlie@example.com', 'member'),
				member('a', 'alpha@example.com', 'admin'),
				member('o', 'zulu-owner@example.com', 'owner')
			]
		});

		expect(workspace.visibleMembers.map((row) => row.email)).toEqual([
			'zulu-owner@example.com',
			'alpha@example.com',
			'charlie@example.com'
		]);

		workspace.filter = '  CHAR ';

		expect(workspace.visibleMembers.map((row) => row.email)).toEqual(['charlie@example.com']);
	});

	it('opens a draft of the saved access and never opens one for the owner', () => {
		const workspace = makeWorkspace({ members: [operator, member('o', 'owner@example.com', 'owner')] });

		workspace.open(member('o', 'owner@example.com', 'owner'));
		expect(workspace.draft).toBeNull();

		workspace.open(operator);
		expect(workspace.draft).toEqual({
			memberId: 'op',
			role: 'member',
			preset: 'operator',
			levels: { ...createCapabilityMap('operate'), training: 'view' },
			scope: { kind: 'groups', groupIds: ['g-1'] }
		});
		expect(workspace.changeCount).toBe(0);
		expect(workspace.areaChangeCount).toBe(1);
		expect(workspace.presetGap('training')).toBe('Operator gives Update');
		expect(workspace.presetGap('calendar')).toBeNull();
	});

	it('snaps the lanes to a new preset and restores the saved levels on the saved preset', () => {
		const workspace = makeWorkspace();
		workspace.open(operator);

		workspace.setPreset('viewer');

		expect(workspace.draft?.levels).toEqual(createCapabilityMap('view'));
		expect(workspace.areaChangeCount).toBe(0);
		// The preset, and the five lanes that moved from Update to View.
		expect(workspace.changeCount).toBe(6);

		workspace.setPreset('operator');

		expect(workspace.draft?.levels).toEqual({ ...createCapabilityMap('operate'), training: 'view' });
		expect(workspace.changeCount).toBe(0);
	});

	it('keeps the stored level on a lane the unit turned off and leaves it out of every count', () => {
		const workspace = makeWorkspace({ offLanes: ['training'] });
		workspace.open(operator);
		expect(workspace.areaChangeCount).toBe(0);
		expect(workspace.presetGap('training')).toBeNull();

		workspace.setLevel('training', 'none');
		workspace.setPreset('editor');

		expect(workspace.draft?.levels).toEqual({ ...createCapabilityMap('configure'), training: 'view' });
		expect(workspace.areaChangeCount).toBe(0);
		// The preset, and the five lanes that are on and moved from Update to Manage.
		expect(workspace.changeCount).toBe(6);
	});

	it('counts what a promotion to Admin saves: the role, Editor, every group and Manage in each lane', () => {
		const workspace = makeWorkspace();
		workspace.open(operator);
		workspace.setLevel('calendar', 'view');
		expect(workspace.changeCount).toBe(1);

		workspace.setRole('admin');
		expect(workspace.changeCount).toBe(9);

		workspace.setRole('member');
		expect(workspace.changeCount).toBe(1);
	});

	it('counts the role, the preset and each lane when an Admin becomes a member', () => {
		const admin = member('ad', 'admin@example.com', 'admin');
		const workspace = makeWorkspace({ members: [admin], offLanes: ['training'] });
		workspace.open(admin);

		workspace.setRole('member');
		workspace.setPreset('viewer');
		for (const lane of ['calendar', 'personnel', 'criticalTasks', 'onboarding', 'ratingScheme'] as const) {
			workspace.setLevel(lane, 'none');
		}

		// Training is off, so the save keeps it and only the five lanes that are on count.
		expect(workspace.changeCount).toBe(7);
	});

	it('shows the stored level on a lane the unit turned off while an Admin becomes a member', () => {
		const admin = member(
			'ad',
			'admin@example.com',
			'admin',
			{},
			{ ...createCapabilityMap('configure'), training: 'view' }
		);
		const workspace = makeWorkspace({ members: [admin], offLanes: ['training'] });
		workspace.open(admin);

		workspace.setRole('member');
		workspace.setPreset('viewer');

		expect(workspace.draft?.levels.training).toBe('view');
		expect(workspace.draft?.levels.calendar).toBe('view');
	});

	it('lets only owners change the role', () => {
		const workspace = makeWorkspace({ isOwner: false });
		workspace.open(operator);

		workspace.setRole('admin');

		expect(workspace.draft?.role).toBe('member');
	});

	it('starts Selected groups empty and toggles group chips', () => {
		const workspace = makeWorkspace({ members: [member('m', 'm@example.com', 'member')] });
		workspace.open(member('m', 'm@example.com', 'member'));

		workspace.setScopeKind('groups');
		expect(workspace.draft?.scope).toEqual({ kind: 'groups', groupIds: [] });

		workspace.toggleScopeGroup('g-2');
		workspace.toggleScopeGroup('g-1');
		workspace.toggleScopeGroup('g-2');

		expect(workspace.draft?.scope).toEqual({ kind: 'groups', groupIds: ['g-1'] });
		expect(workspace.changeCount).toBe(1);
	});

	it('treats Whole unit and the group picks in the invite select as exclusive', () => {
		const workspace = makeWorkspace();
		expect(workspace.inviteGroupsValue).toEqual([ALL_GROUPS]);
		expect(workspace.inviteGroupsLabel).toBe('Whole unit');

		workspace.setInviteGroups([ALL_GROUPS, 'g-1']);
		expect(workspace.invite.groupIds).toEqual(['g-1']);
		expect(workspace.inviteGroupsLabel).toBe('HQ PLT');

		workspace.setInviteGroups(['g-1', 'g-2']);
		expect(workspace.inviteGroupsLabel).toBe('2 groups');

		workspace.setInviteGroups(['g-1', 'g-2', ALL_GROUPS]);
		expect(workspace.invite.groupIds).toEqual([]);

		workspace.setInviteGroups(['g-2']);
		workspace.setInviteGroups([]);
		expect(workspace.inviteGroupsValue).toEqual([ALL_GROUPS]);
	});

	it('clears the invite after a send but keeps the chosen preset', () => {
		const workspace = makeWorkspace();
		workspace.invite = { email: 'new@example.com', role: 'admin', preset: 'viewer', groupIds: ['g-1'] };

		workspace.resetInvite();

		expect(workspace.invite).toEqual({ email: '', role: 'member', preset: 'viewer', groupIds: [] });
	});
});
