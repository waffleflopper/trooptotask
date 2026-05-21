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
});
