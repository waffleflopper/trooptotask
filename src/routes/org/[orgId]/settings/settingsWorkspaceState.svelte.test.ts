import { describe, expect, it } from 'vitest';
import { createSettingsPoliciesState, type SettingsPoliciesSectionData } from './settingsPoliciesState.svelte';
import { createSettingsMemberAccessWorkspace } from '$features/organization';
import type { SettingsMembersSectionData } from '$features/organization/contracts';
import type { SettingsArchivesSectionData } from './settingsSectionTypes';
import { createSettingsArchivedPersonnelState, createSettingsDataExportState } from './settingsWorkspaceState.svelte';

const capabilityMap = {
	calendar: 'configure',
	personnel: 'configure',
	training: 'configure',
	criticalTasks: 'configure',
	onboarding: 'configure',
	ratingScheme: 'configure'
} as const;

type SettingsStateTestData = {
	currentMember: { isOwner: boolean };
	sections: {
		members: SettingsMembersSectionData;
		policies: SettingsPoliciesSectionData;
		archivedPersonnel: SettingsArchivesSectionData;
	};
};

function makeSettingsData(): SettingsStateTestData {
	return {
		currentMember: {
			isOwner: true
		},
		sections: {
			members: {
				rows: [
					{
						id: 'member-1',
						organizationId: 'org-1',
						userId: 'user-1',
						email: 'member@example.com',
						membershipRole: 'member',
						createdAt: '2026-05-20T12:00:00Z',
						access: {
							memberPreset: 'editor',
							capabilityMap,
							scopeSet: { kind: 'organization' },
							organizationGovernanceActions: []
						},
						editor: {
							selectedPreset: 'editor',
							scopeKind: 'organization',
							scopeGroupIds: [],
							availablePresetOptions: [],
							availableGroups: []
						},
						accessBadge: 'editor',
						scopeDisplayLabel: 'All groups',
						overriddenCapabilityLabels: []
					}
				],
				invitations: [],
				invitationHistory: [],
				groups: [],
				roleCounts: { owner: 0, admin: 0, member: 1 },
				memberRoleSummary: '0 Owners · 0 Admins · 1 Member',
				pendingApprovalSummary: { count: 0, oldestCreatedAt: null },
				availableAccessLanes: [],
				capabilityOptions: [],
				canInvite: true,
				canManageMemberAccess: true
			},
			policies: {
				archiveRetention: {
					savedMonths: 36,
					constraints: { min: 1, max: 120, unit: 'months' }
				},
				lossWarning: {
					savedDays: 180,
					constraints: { min: 1, max: 365, unit: 'days' }
				},
				canUpdateRetention: true
			},
			archivedPersonnel: {
				rows: [
					{
						id: 'person-1',
						rank: 'SGT',
						firstName: 'Avery',
						lastName: 'Jones',
						mos: '11B',
						groupName: 'HQ',
						archivedAt: '2026-04-01T12:00:00Z',
						groupId: 'group-1',
						displayName: 'SGT Jones, Avery',
						exportFileStem: 'SGT-Jones'
					}
				],
				retention: {
					months: 36,
					purgeSummary: '1 archived record'
				},
				commands: {
					canRestore: true,
					canExport: true,
					canPermanentlyDelete: true
				}
			}
		}
	};
}

describe('settings workspace state', () => {
	it('owns policy dirty and validity state from Policies section data', () => {
		const state = createSettingsPoliciesState(makeSettingsData().sections.policies);

		expect(state.retentionMonths).toBe(36);
		expect(state.hasRetentionChanges).toBe(false);

		state.retentionMonths = 0;

		expect(state.hasRetentionChanges).toBe(true);
		expect(state.isRetentionValid).toBe(false);

		state.retentionMonths = 48;
		state.markRetentionSaved(48);

		expect(state.savedRetentionMonths).toBe(48);
		expect(state.hasRetentionChanges).toBe(false);
	});

	it('composes member editor state from Members section data', () => {
		const data = makeSettingsData();
		const state = createSettingsMemberAccessWorkspace({
			members: data.sections.members.rows,
			invitations: data.sections.members.invitations,
			groups: data.sections.members.groups,
			isOwner: data.currentMember.isOwner
		});
		const member = state.sortedMembers[0];

		state.openMemberEditor(member);

		expect(state.memberEditorId).toBe('member-1');
		expect(state.getSelectedPreset(member)).toBe('editor');
	});

	it('owns archived personnel delete confirmation command state from Archives section data', () => {
		const state = createSettingsArchivedPersonnelState(makeSettingsData().sections.archivedPersonnel);
		const archivedPerson = state.rows[0];

		state.openPermanentDeleteConfirmation(archivedPerson);

		expect(state.confirmPermanentDelete).toEqual({
			id: 'person-1',
			name: 'SGT Jones, Avery'
		});
		expect(state.permanentDeleteConfirmMatches).toBe(false);

		state.permanentDeleteConfirmText = 'SGT Jones, Avery';

		expect(state.permanentDeleteConfirmMatches).toBe(true);

		state.clearPermanentDeleteConfirmation();

		expect(state.confirmPermanentDelete).toBeNull();
		expect(state.permanentDeleteConfirmText).toBe('');
	});

	it('tracks export progress, success and failure', () => {
		const state = createSettingsDataExportState();

		state.beginExport('json');

		expect(state.exportingOrgJson).toBe(true);
		expect(state.exportingOrgExcel).toBe(false);
		expect(state.exportSuccess).toBe(false);

		state.markExportSucceeded();
		state.finishExport();

		expect(state.exportingOrgJson).toBe(false);
		expect(state.exportSuccess).toBe(true);
	});

	it('owns member capability edits while the editor is open', () => {
		const data = makeSettingsData();
		const state = createSettingsMemberAccessWorkspace({
			members: data.sections.members.rows,
			invitations: data.sections.members.invitations,
			groups: data.sections.members.groups,
			isOwner: data.currentMember.isOwner
		});
		const member = state.sortedMembers.find((row) => row.id === 'member-1');
		expect(member).toBeTruthy();

		state.openMemberEditor(member!);
		state.setMemberCapability(member!.id, 'calendar', 'view');

		expect(state.getEditorCapabilityValue(member!, 'calendar', 'editor')).toBe('view');

		state.closeMemberEditor(member!.id);

		expect(state.getEditorCapabilityValue(member!, 'calendar', 'editor')).toBe('configure');
	});
});
