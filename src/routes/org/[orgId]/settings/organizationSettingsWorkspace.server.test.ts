import { describe, expect, it, vi } from 'vitest';
import {
	buildOrganizationSettingsWorkspace,
	loadOrganizationSettingsWorkspace
} from './organizationSettingsWorkspace.server';

const legacyAccessFlags = {
	can_view_calendar: true,
	can_edit_calendar: true,
	can_view_personnel: true,
	can_edit_personnel: true,
	can_view_training: true,
	can_edit_training: true,
	can_view_critical_tasks: true,
	can_edit_critical_tasks: true,
	can_view_onboarding: true,
	can_edit_onboarding: true,
	can_view_rating_scheme: true,
	can_edit_rating_scheme: true,
	can_manage_members: false
};

describe('organization settings workspace read model', () => {
	it('builds Members and Policies section data from representative source rows', () => {
		const workspace = buildOrganizationSettingsWorkspace({
			currentMemberRole: 'admin',
			isAdmin: true,
			organization: {
				id: 'org-1',
				name: 'Test Org',
				urlSlug: '1-11-bde',
				urlSegment: '1-11-bde',
				effectiveTier: {
					tier: 'unit',
					source: 'subscription',
					personnelCount: 4,
					personnelCap: 500,
					isReadOnly: false,
					giftExpiresAt: null,
					giftTier: null
				}
			},
			members: [
				{
					id: 'member-owner',
					organization_id: 'org-1',
					user_id: 'user-owner',
					email: 'owner@example.com',
					role: 'owner',
					created_at: '2026-05-20T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'viewer',
					capability_overrides: { calendar: 'none' },
					access_scope_kind: 'groups',
					access_scope_group_ids: ['legacy-group']
				},
				{
					id: 'member-a',
					organization_id: 'org-1',
					user_id: 'user-a',
					email: 'member@example.com',
					role: 'member',
					created_at: '2026-05-20T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'viewer',
					capability_overrides: { calendar: 'operate', ratingScheme: 'none' },
					access_scope_kind: 'groups',
					access_scope_group_ids: ['group-alpha']
				}
			],
			invitations: [
				{
					id: 'invite-a',
					email: 'invite@example.com',
					status: 'pending',
					created_at: '2026-05-21T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'operator',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				}
			],
			invitationDeliveries: [
				{
					id: 'outbox-1',
					invitation_id: 'invite-a',
					status: 'failed',
					attempt_count: 1,
					last_error: 'mail provider unavailable',
					updated_at: '2026-05-21T12:05:00Z',
					sent_at: null
				}
			],
			pendingApprovalSummary: {
				count: 0,
				oldestCreatedAt: null
			},
			groups: [
				{ id: 'group-alpha', name: '1st Platoon', organization_id: 'org-1' },
				{ id: 'group-bravo', name: '2nd Platoon', organization_id: 'org-1' }
			],
			organizationSettings: {
				archive_retention_months: 42,
				loss_warning_window_days: 150,
				critical_tasks_default_expiration_months: 18,
				critical_tasks_expiring_soon_warning_days: 45
			},
			exportInfo: {
				exportsUsed: 3,
				exportsLimit: 10,
				isLimited: true
			},
			approvalRequests: [
				{
					id: 'approval-1',
					status: 'pending',
					requester_email: 'requester@example.com',
					resource_description: 'Archived record',
					resource_type: 'personnel',
					resource_url: '/org/org-1/personnel/person-1',
					created_at: '2026-05-20T12:00:00Z',
					denial_reason: null
				}
			],
			auditLog: {
				logs: [
					{
						id: 'audit-1',
						userId: 'user-a',
						actor: 'member@example.com',
						action: 'organization.export.created',
						resourceType: 'organization',
						resourceId: 'org-1',
						details: null,
						createdAt: '2026-05-21T12:00:00Z'
					}
				],
				totalCount: 7,
				last30DaysCount: 4,
				page: 1,
				limit: 9,
				actionFilter: '',
				availableActions: []
			},
			archivedPersonnel: [
				{
					id: 'person-1',
					rank: 'SGT',
					firstName: 'Avery',
					lastName: 'Jones',
					mos: '11B',
					groupName: 'HQ',
					archivedAt: '2026-04-01T12:00:00Z',
					groupId: 'group-1'
				}
			]
		});

		expect(workspace.currentMember).toEqual({
			role: 'admin',
			isOwner: false,
			isAdmin: true,
			canManageMembers: true
		});
		expect(workspace.sections.members.rows).toHaveLength(2);
		expect(workspace.sections.members.invitations).toHaveLength(1);
		expect(workspace.sections.members.invitations[0]).toMatchObject({
			deliveryStatus: 'failed',
			deliveryStatusLabel: 'Email failed',
			deliveryAttemptCount: 1,
			deliveryLastError: 'mail provider unavailable',
			canResend: true
		});
		expect(workspace.sections.members.invitationHistory).toHaveLength(0);
		expect(workspace.sections.members.roleCounts).toEqual({ owner: 1, admin: 0, member: 1 });
		expect(workspace.sections.members.memberRoleSummary).toBe('1 Owner · 0 Admins · 1 Member');
		expect(workspace.sections.members.pendingApprovalSummary).toEqual({
			count: 1,
			oldestCreatedAt: '2026-05-20T12:00:00Z'
		});
		expect(workspace.sections.members.availableAccessLanes.map((lane) => lane.id)).toEqual([
			'calendar',
			'personnel',
			'training',
			'criticalTasks',
			'onboarding',
			'ratingScheme'
		]);
		expect(workspace.sections.members.rows[1].access.capabilityMap).toMatchObject({
			calendar: 'operate',
			ratingScheme: 'none'
		});
		expect(workspace.sections.members.rows[1].editor).toMatchObject({
			selectedPreset: 'viewer',
			scopeKind: 'groups',
			scopeGroupIds: ['group-alpha']
		});
		expect(workspace.sections.members.rows[1].overriddenCapabilityLabels).toEqual([
			'Calendar: Operate',
			'Rating Scheme: None'
		]);
		expect(workspace.sections.policies.archiveRetention).toEqual({
			savedMonths: 42,
			constraints: { min: 1, max: 120, unit: 'months' }
		});
		expect(workspace.sections.policies.lossWarning).toEqual({
			savedDays: 150,
			constraints: { min: 1, max: 365, unit: 'days' }
		});
		expect(workspace.sections.policies.criticalTasks).toEqual({
			savedDefaultExpirationMonths: 18,
			savedExpiringSoonWarningDays: 45,
			defaultExpirationConstraints: { min: 1, max: 120, unit: 'months' },
			expiringSoonWarningConstraints: { min: 1, max: 365, unit: 'days' }
		});
		expect(workspace.sections.organization).toEqual({
			id: 'org-1',
			name: 'Test Org',
			urlSlug: '1-11-bde',
			urlSegment: '1-11-bde',
			tier: {
				tier: 'unit',
				source: 'subscription',
				personnelCount: 4,
				personnelCap: 500,
				isReadOnly: false,
				giftExpiresAt: null,
				giftTier: null
			},
			canUpdateProfile: true,
			canUpdateUrlSlug: true
		});
		expect(workspace.sections.archivedPersonnel).toEqual({
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
				months: 42,
				purgeSummary: '1 archived record'
			},
			commands: {
				canRestore: true,
				canExport: true,
				canPermanentlyDelete: true
			}
		});
		expect(workspace.sections.dataExport.exportInfo).toEqual({
			exportsUsed: 3,
			exportsLimit: 10,
			isLimited: true,
			limitReached: false,
			planBadge: 'Plan limited'
		});
		expect(workspace.sections.dataExport.commands).toEqual({
			canExportJson: true,
			canExportExcel: true
		});
		expect(workspace.sections.dataExport.activity.pendingApprovalsCount).toBe(1);
		expect(workspace.sections.dataExport.activity.approvalRequests).toHaveLength(1);
		expect(workspace.sections.dataExport.activity.auditLog.last30DaysCount).toBe(4);
		expect(workspace.sections.dangerZone).toEqual({
			transferOwnershipCandidates: [],
			deleteConfirmation: {
				organizationName: 'Test Org',
				normalizedOrganizationName: 'Test Org'
			},
			commands: {
				canTransferOwnership: false,
				canDeleteOrganization: false
			}
		});
	});

	it('exposes owner-only Danger Zone data with transfer candidates', () => {
		const workspace = buildOrganizationSettingsWorkspace({
			currentMemberRole: 'owner',
			isAdmin: false,
			organization: {
				id: 'org-1',
				name: 'Test Org',
				urlSlug: null,
				urlSegment: 'org-1',
				effectiveTier: null
			},
			members: [
				{
					id: 'member-owner',
					organization_id: 'org-1',
					user_id: 'user-owner',
					email: 'owner@example.com',
					role: 'owner',
					created_at: '2026-05-20T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'editor',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				},
				{
					id: 'member-a',
					organization_id: 'org-1',
					user_id: 'user-a',
					email: 'member@example.com',
					role: 'member',
					created_at: '2026-05-20T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'editor',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				}
			],
			invitations: [],
			groups: [],
			organizationSettings: null,
			archivedPersonnel: []
		});

		expect(workspace.sections.dangerZone).toMatchObject({
			transferOwnershipCandidates: [
				{
					id: 'member-a',
					userId: 'user-a',
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
		});
	});

	it('does not count pending invitations as pending approvals', () => {
		const workspace = buildOrganizationSettingsWorkspace({
			currentMemberRole: 'owner',
			isAdmin: false,
			organization: {
				id: 'org-1',
				name: 'Test Org',
				urlSlug: null,
				urlSegment: 'org-1',
				effectiveTier: null
			},
			members: [],
			invitations: [
				{
					id: 'invite-a',
					email: 'invite-a@example.com',
					status: 'pending',
					created_at: '2026-05-21T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'operator',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				},
				{
					id: 'invite-b',
					email: 'invite-b@example.com',
					status: 'pending',
					created_at: '2026-05-22T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'viewer',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				}
			],
			pendingApprovalSummary: {
				count: 1,
				oldestCreatedAt: '2026-05-20T12:00:00Z'
			},
			groups: [],
			organizationSettings: null,
			exportInfo: {
				exportsUsed: 5,
				exportsLimit: 5,
				isLimited: true
			},
			archivedPersonnel: []
		});

		expect(workspace.sections.members.invitations).toHaveLength(2);
		expect(workspace.sections.members.invitationHistory).toHaveLength(0);
		expect(workspace.sections.members.pendingApprovalSummary).toEqual({
			count: 1,
			oldestCreatedAt: '2026-05-20T12:00:00Z'
		});
		expect(workspace.sections.archivedPersonnel.retention).toEqual({
			months: 36,
			purgeSummary: 'Retention 36 months'
		});
		expect(workspace.sections.dataExport.exportInfo.limitReached).toBe(true);
	});

	it('separates actionable pending invitations from terminal invitation history', () => {
		const workspace = buildOrganizationSettingsWorkspace({
			currentMemberRole: 'owner',
			isAdmin: false,
			organization: {
				id: 'org-1',
				name: 'Test Org',
				urlSlug: null,
				urlSegment: 'org-1',
				effectiveTier: null
			},
			members: [],
			invitations: [
				{
					id: 'invite-pending',
					email: 'pending@example.com',
					status: 'pending',
					created_at: '2026-05-21T12:00:00Z',
					expires_at: '2999-05-21T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'operator',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				},
				{
					id: 'invite-declined',
					email: 'declined@example.com',
					status: 'declined',
					created_at: '2026-05-21T12:00:00Z',
					declined_at: '2026-05-22T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'viewer',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				},
				{
					id: 'invite-revoked',
					email: 'revoked@example.com',
					status: 'revoked',
					created_at: '2026-05-21T12:00:00Z',
					revoked_at: '2026-05-23T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'viewer',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				},
				{
					id: 'invite-expired',
					email: 'expired@example.com',
					status: 'pending',
					created_at: '2020-05-21T12:00:00Z',
					expires_at: '2020-05-28T12:00:00Z',
					...legacyAccessFlags,
					member_preset: 'viewer',
					capability_overrides: null,
					access_scope_kind: 'organization',
					access_scope_group_ids: []
				}
			],
			groups: [],
			organizationSettings: null,
			archivedPersonnel: []
		});

		expect(workspace.sections.members.invitations.map((invite) => invite.id)).toEqual(['invite-pending']);
		expect(workspace.sections.members.invitationHistory.map((invite) => invite.id)).toEqual([
			'invite-declined',
			'invite-revoked',
			'invite-expired'
		]);
		expect(workspace.sections.members.invitationHistory.map((invite) => invite.lifecycleStatusLabel)).toEqual([
			'Declined',
			'Revoked',
			'Expired'
		]);
		expect(workspace.sections.members.invitationHistory[2].lifecycleAt).toBe('2020-05-28T12:00:00Z');
	});

	it('loads source tables for the completed visible settings workspace', async () => {
		const findMany = vi.fn(async (table: string) => {
			if (table === 'organization_memberships') return [];
			if (table === 'organization_invitations') return [];
			if (table === 'organization_invitation_email_outbox') return [];
			if (table === 'groups') return [];
			if (table === 'personnel') return [];
			if (table === 'deletion_requests') return [];
			throw new Error(`Unexpected table: ${table}`);
		});
		const findOne = vi.fn(async () => ({
			archive_retention_months: 36,
			loss_warning_window_days: 180,
			critical_tasks_default_expiration_months: null,
			critical_tasks_expiring_soon_warning_days: null
		}));

		const workspace = await loadOrganizationSettingsWorkspace(
			{
				auth: { orgId: 'org-1', role: 'owner' },
				store: { findMany },
				rawStore: { findOne }
			} as never,
			{
				isAdmin: false,
				organization: {
					id: 'org-1',
					name: 'Test Org',
					urlSlug: null,
					urlSegment: 'org-1',
					effectiveTier: null
				},
				exportInfo: Promise.resolve({
					exportsUsed: 2,
					exportsLimit: 5,
					isLimited: true
				}),
				auditLog: Promise.resolve({
					logs: [],
					totalCount: 4,
					last30DaysCount: 1,
					page: 1,
					limit: 9,
					actionFilter: '',
					availableActions: []
				})
			}
		);

		expect(findMany.mock.calls.map((call) => call[0])).toEqual([
			'organization_memberships',
			'organization_invitations',
			'organization_invitation_email_outbox',
			'groups',
			'personnel',
			'deletion_requests'
		]);
		expect(findOne).toHaveBeenCalledWith(
			'organizations',
			'org-1',
			{},
			'archive_retention_months, loss_warning_window_days, critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
		);
		expect(workspace.sections.dataExport.exportInfo).toMatchObject({
			exportsUsed: 2,
			exportsLimit: 5,
			limitReached: false
		});
		expect(workspace.sections.dataExport.activity.auditLog).toMatchObject({
			totalCount: 4,
			last30DaysCount: 1
		});
	});
});
