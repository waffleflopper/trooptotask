import { describe, expect, it } from 'vitest';
import { createSettingsMemberAccessWorkspace } from './settingsMemberAccessWorkspace.svelte';
import type {
	DangerSettingsData,
	SettingsArchivesSectionData,
	SettingsExportsSectionData,
	SettingsMembersSectionData,
	SettingsPoliciesSectionData
} from './settingsSectionTypes';
import {
	createSettingsArchivedPersonnelState,
	createSettingsDangerZoneState,
	createSettingsDataExportState,
	createSettingsPoliciesState
} from './settingsWorkspaceState.svelte';

const capabilityMap = {
	calendar: 'configure',
	personnel: 'configure',
	training: 'configure',
	criticalTasks: 'configure',
	onboarding: 'configure',
	ratingScheme: 'configure'
} as const;

type SettingsStateTestData = DangerSettingsData & {
	sections: DangerSettingsData['sections'] & {
		members: SettingsMembersSectionData;
		policies: SettingsPoliciesSectionData;
		archivedPersonnel: SettingsArchivesSectionData;
		dataExport: SettingsExportsSectionData;
	};
};

function makeSettingsData(): SettingsStateTestData {
	return {
		currentMember: {
			role: 'owner',
			isOwner: true,
			isAdmin: false,
			canManageMembers: true
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
				criticalTasks: {
					savedDefaultExpirationMonths: 12,
					savedExpiringSoonWarningDays: 60,
					defaultExpirationConstraints: { min: 1, max: 120, unit: 'months' },
					expiringSoonWarningConstraints: { min: 1, max: 365, unit: 'days' }
				},
				canUpdateRetention: true,
				canUpdateCriticalTasksSettings: true
			},
			organization: {
				id: 'org-1',
				name: 'Test Org',
				urlSlug: '1-11-bde',
				urlSegment: '1-11-bde',
				tier: null,
				canUpdateProfile: true,
				canUpdateUrlSlug: true
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
			},
			dataExport: {
				exportInfo: {
					exportsUsed: 0,
					exportsLimit: Infinity,
					isLimited: false,
					limitReached: false,
					planBadge: 'Unlimited exports',
					upgradeTarget: null,
					limitReachedRemediation: 'Export limit reached. Contact support for export access.'
				},
				commands: {
					canExportJson: true,
					canExportExcel: true
				}
			},
			dangerZone: {
				transferOwnershipCandidates: [
					{
						id: 'member-1',
						userId: 'user-1',
						email: 'member@example.com',
						membershipRole: 'member'
					}
				],
				deleteConfirmation: {
					organizationName: 'Test Org',
					normalizedOrganizationName: 'Test Org'
				},
				commands: {
					canTransferOwnership: true,
					canDeleteOrganization: true
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
		state.markRetentionSaved();

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

	it('owns data export command transition state from Exports section data', () => {
		const state = createSettingsDataExportState(makeSettingsData().sections.dataExport);

		state.beginExport('json');

		expect(state.exportingOrgJson).toBe(true);
		expect(state.exportingOrgExcel).toBe(false);
		expect(state.exportSuccess).toBe(false);

		state.markExportSucceeded();
		state.finishExport();

		expect(state.exportingOrgJson).toBe(false);
		expect(state.exportSuccess).toBe(true);
	});

	it('owns danger zone delete confirmation transition state', () => {
		const state = createSettingsDangerZoneState(makeSettingsData());

		state.openDeleteConfirmation();
		state.deleteConfirmText = 'test org';

		expect(state.showDeleteConfirm).toBe(true);
		expect(state.deleteConfirmMatches).toBe(false);

		state.deleteConfirmText = 'Test Org';

		expect(state.deleteConfirmMatches).toBe(true);

		state.closeDeleteConfirmation();

		expect(state.showDeleteConfirm).toBe(false);
		expect(state.deleteConfirmText).toBe('');
	});

	it('owns ownership transfer confirmation transition state', () => {
		const state = createSettingsDangerZoneState(makeSettingsData());

		state.openTransferConfirmation('user-1');

		expect(state.showTransferConfirm).toBe(true);
		expect(state.selectedTransferCandidate?.email).toBe('member@example.com');
		expect(state.transferConfirmMatches).toBe(false);

		state.transferConfirmText = 'MEMBER@EXAMPLE.COM';

		expect(state.transferConfirmMatches).toBe(true);
		expect(state.transferCloseBlocked).toBe(true);

		state.closeTransferConfirmation();

		expect(state.showTransferConfirm).toBe(false);
		expect(state.transferConfirmText).toBe('');
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
