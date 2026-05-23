import { describe, expect, it } from 'vitest';
import type { OrganizationSettingsWorkspace } from './organizationSettingsWorkspace.server';
import { createSettingsWorkspaceState } from './settingsWorkspaceState.svelte';

const capabilityMap = {
	calendar: 'configure',
	personnel: 'configure',
	training: 'configure',
	criticalTasks: 'configure',
	onboarding: 'configure',
	ratingScheme: 'configure'
} as const;

function makeWorkspace(): OrganizationSettingsWorkspace {
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
					planBadge: 'Unlimited exports'
				},
				commands: {
					canExportJson: true,
					canExportExcel: true
				},
				activity: {
					pendingApprovalsCount: 0,
					approvalRequests: [],
					auditLog: {
						logs: [],
						totalCount: 0,
						last30DaysCount: 0,
						page: 1,
						limit: 9,
						actionFilter: '',
						availableActions: []
					}
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
	it('owns policy dirty and validity state from workspace saved values', () => {
		const state = createSettingsWorkspaceState(makeWorkspace());

		expect(state.policies.retentionMonths).toBe(36);
		expect(state.policies.hasRetentionChanges).toBe(false);

		state.policies.retentionMonths = 0;

		expect(state.policies.hasRetentionChanges).toBe(true);
		expect(state.policies.isRetentionValid).toBe(false);

		state.policies.retentionMonths = 48;
		state.policies.markRetentionSaved();

		expect(state.policies.savedRetentionMonths).toBe(48);
		expect(state.policies.hasRetentionChanges).toBe(false);
	});

	it('composes member editor state from the workspace section', () => {
		const state = createSettingsWorkspaceState(makeWorkspace());
		const member = state.members.sortedMembers[0];

		state.members.openMemberEditor(member);

		expect(state.members.memberEditorId).toBe('member-1');
		expect(state.members.getSelectedPreset(member)).toBe('editor');
	});

	it('owns archived personnel delete confirmation command state', () => {
		const state = createSettingsWorkspaceState(makeWorkspace());
		const archivedPerson = state.archivedPersonnel.rows[0];

		state.archivedPersonnel.openPermanentDeleteConfirmation(archivedPerson);

		expect(state.archivedPersonnel.confirmPermanentDelete).toEqual({
			id: 'person-1',
			name: 'SGT Jones, Avery'
		});
		expect(state.archivedPersonnel.permanentDeleteConfirmMatches).toBe(false);

		state.archivedPersonnel.permanentDeleteConfirmText = 'SGT Jones, Avery';

		expect(state.archivedPersonnel.permanentDeleteConfirmMatches).toBe(true);

		state.archivedPersonnel.clearPermanentDeleteConfirmation();

		expect(state.archivedPersonnel.confirmPermanentDelete).toBeNull();
		expect(state.archivedPersonnel.permanentDeleteConfirmText).toBe('');
	});

	it('owns data export command transition state', () => {
		const state = createSettingsWorkspaceState(makeWorkspace());

		state.dataExport.beginExport('json');

		expect(state.dataExport.exportingOrgJson).toBe(true);
		expect(state.dataExport.exportingOrgExcel).toBe(false);
		expect(state.dataExport.exportSuccess).toBe(false);

		state.dataExport.markExportSucceeded();
		state.dataExport.finishExport();

		expect(state.dataExport.exportingOrgJson).toBe(false);
		expect(state.dataExport.exportSuccess).toBe(true);
	});

	it('owns danger zone delete confirmation transition state', () => {
		const state = createSettingsWorkspaceState(makeWorkspace());

		state.dangerZone.openDeleteConfirmation();
		state.dangerZone.deleteConfirmText = 'test org';

		expect(state.dangerZone.showDeleteConfirm).toBe(true);
		expect(state.dangerZone.deleteConfirmMatches).toBe(false);

		state.dangerZone.deleteConfirmText = 'Test Org';

		expect(state.dangerZone.deleteConfirmMatches).toBe(true);

		state.dangerZone.closeDeleteConfirmation();

		expect(state.dangerZone.showDeleteConfirm).toBe(false);
		expect(state.dangerZone.deleteConfirmText).toBe('');
	});

	it('owns ownership transfer confirmation transition state', () => {
		const state = createSettingsWorkspaceState(makeWorkspace());

		state.dangerZone.openTransferConfirmation('user-1');

		expect(state.dangerZone.showTransferConfirm).toBe(true);
		expect(state.dangerZone.selectedTransferCandidate?.email).toBe('member@example.com');
		expect(state.dangerZone.transferConfirmMatches).toBe(false);

		state.dangerZone.transferConfirmText = 'MEMBER@EXAMPLE.COM';

		expect(state.dangerZone.transferConfirmMatches).toBe(true);
		expect(state.dangerZone.transferCloseBlocked).toBe(true);

		state.dangerZone.closeTransferConfirmation();

		expect(state.dangerZone.showTransferConfirm).toBe(false);
		expect(state.dangerZone.transferConfirmText).toBe('');
	});

	it('owns member capability edits while the editor is open', () => {
		const state = createSettingsWorkspaceState(makeWorkspace());
		const member = state.members.sortedMembers.find((row) => row.id === 'member-1');
		expect(member).toBeTruthy();

		state.members.openMemberEditor(member!);
		state.members.setMemberCapability(member!.id, 'calendar', 'view');

		expect(state.members.getEditorCapabilityValue(member!, 'calendar', 'editor')).toBe('view');

		state.members.closeMemberEditor(member!.id);

		expect(state.members.getEditorCapabilityValue(member!, 'calendar', 'editor')).toBe('configure');
	});
});
