// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { downloadBlob } from './settingsDownloads';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => false)
}));

vi.mock('$app/forms', () => ({
	enhance: () => () => {}
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	billingEnabledMock.mockReturnValue(false);
});

const editorCapabilityMap = {
	calendar: 'configure',
	personnel: 'configure',
	training: 'configure',
	criticalTasks: 'configure',
	onboarding: 'configure',
	ratingScheme: 'configure'
};

function member(id: string, email: string, role: 'owner' | 'admin' | 'member', overrides = {}) {
	return {
		id,
		organizationId: 'org-1',
		userId: `user-${id}`,
		email,
		membershipRole: role,
		createdAt: '2026-04-01T00:00:00Z',
		access: {
			memberPreset: 'editor',
			capabilityMap: editorCapabilityMap,
			scopeSet: { kind: 'organization' },
			organizationGovernanceActions: role === 'admin' || role === 'owner' ? ['organization.accessGovernance'] : [],
			...overrides
		}
	};
}

const baseData = {
	session: null,
	allOrgs: [],
	orgId: 'org-1',
	orgName: 'Test Org',
	orgUrlSegment: 'org-1',
	orgUrlSlug: null,
	isOwner: true,
	isAdmin: false,
	canManageMembers: true,
	permissions: { canManageMembers: true },
	effectiveTier: {
		tier: 'unit',
		source: 'subscription',
		personnelCount: 4,
		personnelCap: 500,
		isReadOnly: false,
		giftExpiresAt: null,
		giftTier: null
	},
	members: [
		member('member-1', 'owner@example.com', 'owner'),
		member('member-2', 'admin@example.com', 'admin'),
		member('member-3', 'member-a@example.com', 'member'),
		member('member-4', 'member-b@example.com', 'member')
	],
	invitations: [],
	invitationHistory: [],
	groups: [
		{ id: 'group-alpha', name: '1st Platoon' },
		{ id: 'group-bravo', name: '2nd Platoon' }
	],
	exportInfo: {
		exportsUsed: 0,
		exportsLimit: Infinity,
		isLimited: false
	},
	policies: {
		retentionMonths: 36,
		lossWarningWindowDays: 180,
		criticalTasksSettings: {
			defaultExpirationMonths: 12,
			expiringSoonWarningDays: 60
		}
	},
	archivedPersonnel: [],
	approvalRequests: [
		{
			id: 'request-1',
			status: 'pending',
			requester_email: 'requester@example.com',
			resource_description: 'Delete archived record',
			resource_type: 'personnel',
			resource_url: null,
			created_at: '2026-04-26T12:00:00Z',
			denial_reason: null
		}
	],
	pendingApprovalsCount: 1,
	auditLog: {
		logs: [
			{
				id: 'audit-1',
				userId: 'user-1',
				actor: 'admin@example.com',
				action: 'organization.rename',
				resourceType: 'organization',
				resourceId: 'org-1',
				details: { name: 'Test Org' },
				createdAt: '2026-04-26T12:00:00Z'
			}
		],
		totalCount: 1,
		last30DaysCount: 1,
		page: 1,
		limit: 100,
		actionFilter: '',
		availableActions: ['organization.rename']
	},
	planUsageSummary: {
		plan: {
			tier: 'unit',
			source: 'billing_snapshot',
			sourceLabel: 'Stripe-backed billing'
		},
		rows: [
			{
				dimension: 'active_personnel',
				label: 'Personnel',
				used: 4,
				limit: 500,
				limitLabel: '500',
				status: 'within_limit',
				message: 'Personnel usage is 4 of 500.',
				remediation: 'Archive personnel or upgrade to support.',
				upgradeTarget: null
			},
			{
				dimension: 'active_organization_members',
				label: 'Members',
				used: 4,
				limit: 50,
				limitLabel: '50',
				status: 'within_limit',
				message: 'Member usage is 4 of 50.',
				remediation: 'Remove members or upgrade to support.',
				upgradeTarget: null
			},
			{
				dimension: 'pending_invitations',
				label: 'Pending invitations',
				used: 0,
				limit: 50,
				limitLabel: '50',
				status: 'within_limit',
				message: 'Pending invitations use 0 seats; 4 of 50 member seats are reserved.',
				remediation: 'Revoke pending invitations or upgrade to support.',
				upgradeTarget: null
			},
			{
				dimension: 'monthly_exports',
				label: 'Monthly exports',
				used: 0,
				limit: null,
				limitLabel: 'Unlimited',
				status: 'within_limit',
				message: 'Export usage is 0 of Unlimited this month.',
				remediation: 'Contact support or wait until next month.',
				upgradeTarget: null
			}
		],
		alerts: [] as Array<{
			dimension: string;
			label: string;
			message: string;
			remediation: string;
			status: string;
		}>
	}
};

type SettingsPageTestData = Omit<
	typeof baseData,
	'members' | 'invitations' | 'invitationHistory' | 'groups' | 'archivedPersonnel' | 'approvalRequests'
> & {
	members: Array<ReturnType<typeof member>>;
	invitations: unknown[];
	invitationHistory: unknown[];
	groups: Array<{ id: string; name: string }>;
	archivedPersonnel: Array<Record<string, unknown>>;
	approvalRequests: Array<{ created_at?: string; status?: string }>;
};

function workspaceFor(data: SettingsPageTestData) {
	const roleCounts = data.members.reduce(
		(counts: { owner: number; admin: number; member: number }, row: { membershipRole: string }) => {
			counts[row.membershipRole as 'owner' | 'admin' | 'member'] += 1;
			return counts;
		},
		{ owner: 0, admin: 0, member: 0 }
	);
	const pendingApprovalRequests = data.approvalRequests.filter((request) => request.status === 'pending');
	const transferOwnershipCandidates = data.isOwner
		? data.members
				.filter((row) => row.membershipRole !== 'owner' && row.userId)
				.map((row) => ({
					id: row.id,
					userId: row.userId,
					email: row.email,
					membershipRole: row.membershipRole
				}))
		: [];
	return {
		...data,
		workspace: {
			currentMember: {
				role: data.isOwner ? 'owner' : 'admin',
				isOwner: data.isOwner,
				isAdmin: data.isAdmin,
				canManageMembers: data.canManageMembers
			},
			sections: {
				organization: {
					id: data.orgId,
					name: data.orgName,
					urlSlug: data.orgUrlSlug ?? null,
					urlSegment: data.orgUrlSegment ?? data.orgId,
					tier: data.effectiveTier,
					canUpdateProfile: data.canManageMembers,
					canUpdateUrlSlug: data.canManageMembers
				},
				members: {
					rows: data.members,
					invitations: data.invitations,
					invitationHistory: data.invitationHistory,
					groups: data.groups,
					roleCounts,
					memberRoleSummary: `${roleCounts.owner} ${roleCounts.owner === 1 ? 'Owner' : 'Owners'} · ${roleCounts.admin} ${roleCounts.admin === 1 ? 'Admin' : 'Admins'} · ${roleCounts.member} ${roleCounts.member === 1 ? 'Member' : 'Members'}`,
					pendingApprovalSummary: {
						count: pendingApprovalRequests.length,
						oldestCreatedAt: pendingApprovalRequests[0]?.created_at ?? null
					},
					availableAccessLanes: [
						{ id: 'calendar', label: 'Calendar' },
						{ id: 'personnel', label: 'Personnel' },
						{ id: 'training', label: 'Training' },
						{ id: 'criticalTasks', label: 'Critical Tasks' },
						{ id: 'onboarding', label: 'Onboarding' },
						{ id: 'ratingScheme', label: 'Rating Scheme' }
					],
					capabilityOptions: [
						{ value: 'none', label: 'None' },
						{ value: 'view', label: 'View' },
						{ value: 'operate', label: 'Operate' },
						{ value: 'configure', label: 'Configure' }
					],
					canInvite: data.canManageMembers,
					canManageMemberAccess: data.canManageMembers
				},
				policies: {
					archiveRetention: {
						savedMonths: data.policies.retentionMonths,
						constraints: { min: 1, max: 120, unit: 'months' }
					},
					lossWarning: {
						savedDays: data.policies.lossWarningWindowDays,
						constraints: { min: 1, max: 365, unit: 'days' }
					},
					criticalTasks: {
						savedDefaultExpirationMonths: data.policies.criticalTasksSettings.defaultExpirationMonths,
						savedExpiringSoonWarningDays: data.policies.criticalTasksSettings.expiringSoonWarningDays,
						defaultExpirationConstraints: { min: 1, max: 120, unit: 'months' },
						expiringSoonWarningConstraints: { min: 1, max: 365, unit: 'days' }
					},
					canUpdateRetention: data.canManageMembers,
					canUpdateCriticalTasksSettings: data.canManageMembers
				},
				archivedPersonnel: {
					rows: data.archivedPersonnel.map((person) => ({
						id: String(person.id),
						rank: String(person.rank),
						firstName: String(person.firstName),
						lastName: String(person.lastName),
						mos: (person.mos as string | null) ?? null,
						groupName: (person.groupName as string | null) ?? null,
						archivedAt: String(person.archivedAt),
						groupId: (person.groupId as string | null) ?? null,
						displayName: `${person.rank} ${person.lastName}, ${person.firstName}`,
						exportFileStem: `${person.rank}-${person.lastName}`
					})),
					retention: {
						months: data.policies.retentionMonths,
						purgeSummary:
							data.archivedPersonnel.length === 0
								? `Retention ${data.policies.retentionMonths} months`
								: `${data.archivedPersonnel.length} archived ${data.archivedPersonnel.length === 1 ? 'record' : 'records'}`
					},
					commands: {
						canRestore: data.canManageMembers,
						canExport: data.canManageMembers,
						canPermanentlyDelete: data.canManageMembers
					}
				},
				dataExport: {
					exportInfo: {
						...data.exportInfo,
						limitReached: data.exportInfo.isLimited && data.exportInfo.exportsUsed >= data.exportInfo.exportsLimit,
						planBadge: data.exportInfo.isLimited ? 'Plan limited' : 'Unlimited exports'
					},
					commands: {
						canExportJson: !(data.exportInfo.isLimited && data.exportInfo.exportsUsed >= data.exportInfo.exportsLimit),
						canExportExcel: !(data.exportInfo.isLimited && data.exportInfo.exportsUsed >= data.exportInfo.exportsLimit)
					},
					activity: {
						pendingApprovalsCount: pendingApprovalRequests.length,
						approvalRequests: data.approvalRequests,
						auditLog: data.auditLog
					}
				},
				dangerZone: {
					transferOwnershipCandidates,
					deleteConfirmation: {
						organizationName: data.orgName,
						normalizedOrganizationName: data.orgName.trim().replace(/\s+/g, ' ')
					},
					commands: {
						canTransferOwnership: data.isOwner && transferOwnershipCandidates.length > 0,
						canDeleteOrganization: data.isOwner
					}
				}
			}
		}
	};
}

describe('org settings page', () => {
	it('renders the shadcn settings shell with summary metrics and shared tabs', () => {
		render(Page, {
			props: {
				data: workspaceFor(baseData) as never,
				form: null as never
			}
		});

		expect(screen.getByRole('heading', { name: 'Organization Settings' })).toBeTruthy();
		expect(screen.getByRole('region', { name: 'Organization settings summary' })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Members 4/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Pending approvals 1/ })).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'Organization' })).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'Members' })).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'Policies' })).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'Archived Personnel' })).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'Data & Export' })).toBeTruthy();
		expect(screen.getByRole('tab', { name: 'Danger Zone' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Sign Out' }).getAttribute('href')).toBe('/auth/logout');
		expect(screen.getByRole('link', { name: 'Switch Organization' }).getAttribute('href')).toBe('/dashboard?show=all');
		expect(screen.getByRole('heading', { name: 'Organization Profile' })).toBeTruthy();
		expect(screen.getByText('Displayed across briefs, exports, and printed rosters.')).toBeTruthy();
	});

	it('renders member access management and supports the preset editor behavior', async () => {
		render(Page, {
			props: {
				data: {
					...workspaceFor({
						...baseData,
						members: [
							member('member-1', 'owner@example.com', 'owner'),
							member('member-2', 'admin@example.com', 'admin'),
							member('member-3', 'member-a@example.com', 'member', {
								memberPreset: 'viewer',
								capabilityMap: {
									...editorCapabilityMap,
									calendar: 'operate',
									personnel: 'view',
									training: 'view',
									criticalTasks: 'view',
									onboarding: 'view',
									ratingScheme: 'none'
								},
								scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] }
							}),
							member('member-4', 'member-b@example.com', 'member')
						]
					})
				} as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Members' }));

		expect(screen.getByRole('heading', { name: 'Access Management' })).toBeTruthy();
		expect(screen.getByText('Admin authority is separate from member access.')).toBeTruthy();
		expect(screen.getAllByText('member-a@example.com').length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText('Viewer').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('Calendar: Can update')).toBeTruthy();
		expect(screen.getByText('Rating Scheme: No access')).toBeTruthy();
		expect(screen.getByText('1st Platoon, 2nd Platoon')).toBeTruthy();
		expect(screen.getAllByRole('button', { name: /Manage Role & Access/ })).toHaveLength(3);

		await fireEvent.click(screen.getAllByRole('button', { name: /Manage Role & Access/ }).at(-1)!);
		const roleControl = screen.getAllByRole('button', { name: /Membership Role/ })[0];
		const accessPreset = screen.getAllByRole('button', { name: /Member Preset/ })[0];
		const editorForm = accessPreset.closest('form')!;
		const calendarCapability = within(editorForm).getByRole('button', { name: 'Calendar' });

		expect(roleControl.textContent).toContain('Member');
		expect((editorForm.querySelector('input[name="membershipRole"]') as HTMLInputElement).value).toBe('member');
		expect(accessPreset.textContent).toContain('Editor');
		expect((editorForm.querySelector('input[name="memberPreset"]') as HTMLInputElement).value).toBe('editor');
		expect(calendarCapability.textContent).toContain('Can manage');
		expect((editorForm.querySelector('input[name="capabilityOverride:calendar"]') as HTMLInputElement).value).toBe(
			'configure'
		);
	});

	it('renders pending invitations separately from terminal invitation history', async () => {
		const invitationAccess = {
			memberPreset: 'viewer',
			capabilityMap: editorCapabilityMap,
			scopeSet: { kind: 'organization' },
			organizationGovernanceActions: []
		};
		render(Page, {
			props: {
				data: workspaceFor({
					...baseData,
					invitations: [
						{
							id: 'invite-pending',
							email: 'pending@example.com',
							status: 'pending',
							membershipRole: 'member',
							createdAt: '2026-05-20T12:00:00Z',
							access: invitationAccess,
							accessBadge: 'viewer',
							scopeDisplayLabel: 'All groups',
							deliveryStatus: 'failed',
							deliveryStatusLabel: 'Email failed',
							deliveryAttemptCount: 1,
							deliveryLastError: 'mail provider unavailable',
							deliveryUpdatedAt: '2026-05-20T12:05:00Z',
							deliverySentAt: null,
							canResend: true
						}
					],
					invitationHistory: [
						{
							id: 'invite-declined',
							email: 'declined@example.com',
							status: 'declined',
							membershipRole: 'member',
							createdAt: '2026-05-18T12:00:00Z',
							access: invitationAccess,
							accessBadge: 'viewer',
							scopeDisplayLabel: 'All groups',
							lifecycleStatus: 'declined',
							lifecycleStatusLabel: 'Declined',
							lifecycleDetail: null,
							lifecycleAt: '2026-05-21T12:00:00Z'
						},
						{
							id: 'invite-blocked',
							email: 'blocked@example.com',
							status: 'blocked',
							membershipRole: 'member',
							createdAt: '2026-05-18T12:00:00Z',
							access: invitationAccess,
							accessBadge: 'viewer',
							scopeDisplayLabel: 'All groups',
							lifecycleStatus: 'blocked',
							lifecycleStatusLabel: 'Blocked',
							lifecycleDetail: 'Linked platform access was rejected or closed before account setup finished.',
							lifecycleAt: '2026-05-22T12:00:00Z'
						}
					]
				}) as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Members' }));

		expect(screen.getByRole('heading', { name: 'Pending Invitations' })).toBeTruthy();
		expect(screen.getByText('pending@example.com')).toBeTruthy();
		expect(screen.getByText(/Email failed/)).toBeTruthy();
		expect(screen.getByRole('button', { name: /Resend/ })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Invitation History' })).toBeTruthy();
		expect(screen.getByText('declined@example.com')).toBeTruthy();
		expect(screen.getAllByText('Declined').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('blocked@example.com')).toBeTruthy();
		expect(
			screen.getByText('Linked platform access was rejected or closed before account setup finished.')
		).toBeTruthy();
	});

	it('renders policies with shared controls and validation copy', async () => {
		render(Page, {
			props: {
				data: workspaceFor(baseData) as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Policies' }));

		expect(screen.getByRole('heading', { name: 'Policies' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Archive Retention' })).toBeTruthy();
		expect(screen.getByLabelText('Retention period')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Loss Warning Window' })).toBeTruthy();
		expect(screen.getByLabelText('Warning lead time')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Critical Tasks Defaults' })).toBeTruthy();
		expect(screen.getByLabelText('Default expiration')).toBeTruthy();
		expect(screen.getByLabelText('Expiring-soon window')).toBeTruthy();
		expect(screen.getByLabelText('Auto-notify squad leader').hasAttribute('disabled')).toBe(true);
		expect(screen.getAllByText('Coming soon').length).toBeGreaterThanOrEqual(1);
	});

	it('renders archived personnel with shared table primitives', async () => {
		render(Page, {
			props: {
				data: {
					...workspaceFor({
						...baseData,
						archivedPersonnel: [
							{
								id: 'archived-1',
								rank: 'PV2',
								firstName: 'Henry',
								lastName: 'Abbott',
								mos: '11B',
								groupName: '2nd Platoon',
								archivedAt: '2026-04-14T12:00:00Z',
								groupId: 'group-1'
							}
						]
					})
				} as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Archived Personnel' }));

		const archivedTable = screen.getByRole('region', { name: 'Archived personnel records' });
		expect(within(archivedTable).getByText('PV2 Abbott, Henry')).toBeTruthy();
		expect(within(archivedTable).getByText('14 APR 26')).toBeTruthy();
		expect(within(archivedTable).getByRole('button', { name: 'Restore' })).toBeTruthy();
		expect(within(archivedTable).getByRole('button', { name: 'Export' })).toBeTruthy();
		expect(within(archivedTable).getByRole('button', { name: 'Delete' })).toBeTruthy();

		await fireEvent.click(within(archivedTable).getByRole('button', { name: 'Delete' }));
		const dialog = screen.getByRole('dialog', { name: 'Permanently Delete Personnel' });
		expect(within(dialog).getByText('Export the record first if it may be needed later.')).toBeTruthy();
		expect(within(dialog).getByRole('button', { name: 'Permanently Delete' }).hasAttribute('disabled')).toBe(true);
		await fireEvent.input(within(dialog).getByLabelText('Type PV2 Abbott, Henry to confirm'), {
			target: { value: 'PV2 Abbott, Henry' }
		});
		expect(within(dialog).getByRole('button', { name: 'Permanently Delete' }).hasAttribute('disabled')).toBe(false);
	});

	it('disables archived personnel commands when workspace command eligibility denies them', async () => {
		render(Page, {
			props: {
				data: {
					...workspaceFor({
						...baseData,
						isOwner: false,
						isAdmin: true,
						canManageMembers: false,
						archivedPersonnel: [
							{
								id: 'archived-1',
								rank: 'PV2',
								firstName: 'Henry',
								lastName: 'Abbott',
								mos: '11B',
								groupName: '2nd Platoon',
								archivedAt: '2026-04-14T12:00:00Z',
								groupId: 'group-1'
							}
						]
					})
				} as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Archived Personnel' }));

		const archivedTable = screen.getByRole('region', { name: 'Archived personnel records' });
		expect(within(archivedTable).getByRole('button', { name: 'Restore' }).hasAttribute('disabled')).toBe(true);
		expect(within(archivedTable).getByRole('button', { name: 'Export' }).hasAttribute('disabled')).toBe(true);
		expect(within(archivedTable).getByRole('button', { name: 'Delete' }).hasAttribute('disabled')).toBe(true);
	});

	it('renders data export controls and the activity panel', async () => {
		render(Page, {
			props: {
				data: workspaceFor(baseData) as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Data & Export' }));

		expect(screen.getByRole('heading', { name: 'Data & Export' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Export JSON' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Export Excel' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'View Audit Log' }).getAttribute('href')).toBe('/org/org-1/settings');
		const activity = screen.getByRole('complementary', { name: 'Settings activity' });
		expect(within(activity).getByRole('tab', { name: /Approvals 1/ })).toBeTruthy();
		expect(within(activity).getByText('Delete archived record')).toBeTruthy();
		await fireEvent.click(within(activity).getByRole('tab', { name: 'Audit Log' }));
		expect(within(activity).getByText('Organization › Rename')).toBeTruthy();
	});

	it('renders owner danger controls and guarded delete confirmation', async () => {
		render(Page, {
			props: {
				data: workspaceFor(baseData) as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Danger Zone' }));

		expect(screen.getByRole('heading', { name: 'Destructive Actions' })).toBeTruthy();
		expect(screen.getByText('Hand the Owner role to another member. You will become Admin.')).toBeTruthy();
		expect(screen.getByRole('button', { name: /Purge Archived/ }).hasAttribute('disabled')).toBe(true);

		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Transfer ownership' }));
		const adminOption = await screen.findByRole('option', { name: 'admin@example.com' });
		await fireEvent.pointerDown(adminOption);
		await fireEvent.pointerUp(adminOption);
		await fireEvent.click(screen.getByRole('button', { name: 'Transfer Ownership' }));
		const transferDialog = screen.getByRole('dialog', { name: 'Transfer Ownership' });
		expect(within(transferDialog).getByText(/Transfer owner authority to admin@example.com/)).toBeTruthy();
		expect(within(transferDialog).getByRole('button', { name: 'Transfer Ownership' }).hasAttribute('disabled')).toBe(
			true
		);
		await fireEvent.input(within(transferDialog).getByLabelText('Type admin@example.com to confirm'), {
			target: { value: 'admin@example.com' }
		});
		expect(within(transferDialog).getByRole('button', { name: 'Transfer Ownership' }).hasAttribute('disabled')).toBe(
			false
		);
		await fireEvent.click(within(transferDialog).getByRole('button', { name: 'Cancel' }));

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Test Org' }));
		const dialog = screen.getByRole('dialog', { name: 'Delete Organization' });
		expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy();
		expect(within(dialog).getByRole('button', { name: 'Delete Permanently' }).hasAttribute('disabled')).toBe(true);
		await fireEvent.input(within(dialog).getByLabelText('Type Test Org to confirm'), { target: { value: 'Test Org' } });
		expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
		expect(within(dialog).getByRole('button', { name: 'Delete Permanently' }).hasAttribute('disabled')).toBe(false);

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

		expect(screen.queryByRole('dialog', { name: 'Delete Organization' })).toBeNull();
	});

	it('shows billing access when billing is enabled', () => {
		billingEnabledMock.mockReturnValue(true);

		render(Page, {
			props: {
				data: workspaceFor(baseData) as never,
				form: null as never
			}
		});

		expect(screen.getByRole('link', { name: 'Manage Billing' }).getAttribute('href')).toBe('/org/org-1/billing');
		expect(screen.getByText('Unit tier · $12/mo')).toBeTruthy();
		expect(screen.getAllByText('4 / 500').length).toBeGreaterThanOrEqual(1);
	});

	it('renders plan usage and remediation in organization settings', () => {
		render(Page, {
			props: {
				data: workspaceFor({
					...baseData,
					planUsageSummary: {
						...baseData.planUsageSummary,
						rows: [
							{
								...baseData.planUsageSummary.rows[0],
								used: 501,
								limit: 500,
								limitLabel: '500',
								status: 'over_limit',
								message: 'Personnel usage is 501 of 500.',
								remediation: 'Archive personnel or contact support.',
								upgradeTarget: null
							},
							...baseData.planUsageSummary.rows.slice(1)
						],
						alerts: [
							{
								dimension: 'active_personnel',
								label: 'Personnel',
								message: 'Personnel usage is 501 of 500.',
								remediation: 'Archive personnel or contact support.',
								status: 'over_limit'
							}
						]
					}
				}) as never,
				form: null as never
			}
		});

		expect(screen.getByRole('heading', { name: 'Plan Usage & Limits' })).toBeTruthy();
		expect(screen.getByText('501 / 500')).toBeTruthy();
		expect(screen.getByText('Archive personnel or contact support.')).toBeTruthy();
		expect(screen.getByText('Existing data remains visible while limits are resolved.')).toBeTruthy();
	});

	it('attaches download anchors before triggering the download', () => {
		const createObjectURL = vi.fn(() => 'blob:archived-personnel');
		const revokeObjectURL = vi.fn();
		vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);

		const appendSpy = vi.spyOn(document.body, 'appendChild');
		const removeSpy = vi.spyOn(document.body, 'removeChild');
		const createdAnchors: HTMLAnchorElement[] = [];
		const anchorClick = vi.fn(() => {
			const anchor = createdAnchors[0];
			expect(anchor).toBeDefined();
			if (!anchor) throw new Error('Expected download anchor to be created');
			expect(document.body.contains(anchor)).toBe(true);
		});
		const createElement = document.createElement.bind(document);
		vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => {
			const element = createElement(tagName, options);
			if (tagName === 'a') {
				createdAnchors.push(element as HTMLAnchorElement);
				Object.defineProperty(element, 'click', { value: anchorClick, configurable: true });
			}
			return element;
		});

		downloadBlob(new Blob(['archived personnel export']), 'PV2-Abbott-records.xlsx');

		const anchor = createdAnchors[0];
		expect(anchor).toBeInstanceOf(HTMLAnchorElement);
		if (!anchor) throw new Error('Expected download anchor to be created');
		expect(anchor.href).toBe('blob:archived-personnel');
		expect(anchor.download).toBe('PV2-Abbott-records.xlsx');
		expect(appendSpy).toHaveBeenCalledWith(anchor);
		expect(anchorClick).toHaveBeenCalledTimes(1);
		expect(removeSpy).toHaveBeenCalledWith(anchor);
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:archived-personnel');
		expect(document.body.contains(anchor)).toBe(false);
	});
});
