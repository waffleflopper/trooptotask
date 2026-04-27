// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';

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
	billingEnabledMock.mockReturnValue(false);
});

const fullEditorPermissions = {
	canViewCalendar: true,
	canEditCalendar: true,
	canViewPersonnel: true,
	canEditPersonnel: true,
	canViewTraining: true,
	canEditTraining: true,
	canViewCriticalTasks: true,
	canEditCriticalTasks: true,
	canViewOnboarding: true,
	canEditOnboarding: true,
	canViewRatingScheme: true,
	canEditRatingScheme: true,
	canViewLeadersBook: true,
	canEditLeadersBook: true,
	canManageMembers: false
};

function member(id: string, email: string, role: 'owner' | 'admin' | 'member', overrides = {}) {
	return {
		id,
		organizationId: 'org-1',
		userId: `user-${id}`,
		email,
		role,
		scopedGroupId: null,
		createdAt: '2026-04-01T00:00:00Z',
		...fullEditorPermissions,
		...(role === 'admin' || role === 'owner' ? { canManageMembers: true } : {}),
		...overrides
	};
}

const baseData = {
	session: null,
	allOrgs: [],
	orgId: 'org-1',
	orgName: 'Test Org',
	isOwner: true,
	isAdmin: false,
	canManageMembers: true,
	permissions: { canManageMembers: true },
	effectiveTier: {
		tier: 'unit',
		source: 'subscription',
		personnelCount: 4,
		personnelCap: Infinity,
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
	groups: [],
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
	}
};

describe('org settings page', () => {
	it('renders the consolidated settings workspace with section navigation and activity rail', () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		const nav = screen.getByRole('navigation', { name: 'Organization settings sections' });
		expect(within(nav).getByRole('button', { name: /Organization/ })).toBeTruthy();
		expect(within(nav).getByRole('button', { name: /Members/ })).toBeTruthy();
		expect(within(nav).getByRole('button', { name: /Policies/ })).toBeTruthy();
		expect(within(nav).getByRole('button', { name: /Archived Personnel/ })).toBeTruthy();
		expect(within(nav).getByRole('button', { name: /Data & Export/ })).toBeTruthy();
		const activity = screen.getByRole('complementary', { name: 'Settings activity' });
		expect(activity).toBeTruthy();
		expect(within(activity).getByRole('tab', { name: /Approvals 1/ })).toBeTruthy();
		expect(within(activity).getByText('requester@example.com')).toBeTruthy();
		expect(within(activity).getByText('Delete archived record')).toBeTruthy();
		expect(within(activity).getByText('No more pending requests.')).toBeTruthy();
		expect(within(activity).queryByText('Approval status')).toBeNull();
		expect(screen.getByRole('link', { name: 'Sign Out' }).getAttribute('href')).toBe('/auth/logout');
		expect(screen.getByRole('link', { name: 'Switch Organization' }).getAttribute('href')).toBe('/dashboard?show=all');
		expect(screen.getByText('4')).toBeTruthy();
		expect(screen.getByText('1 Owner · 1 Admin · 2 Members')).toBeTruthy();
		expect(screen.getByText('Organization Profile')).toBeTruthy();
		expect(screen.getByText('Subscription & Billing')).toBeTruthy();
		expect(screen.getByText('Session')).toBeTruthy();
		expect(screen.getByText('Displayed across briefs, exports, and printed rosters.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Short code Coming soon' }).getAttribute('aria-disabled')).toBe('true');
		expect(screen.getByText('Coming soon: future organization slugs for URLs and printed headers.')).toBeTruthy();
		expect(screen.queryByText('Pending Invites')).toBeNull();
		expect(screen.queryByText('Active people with access to this organization')).toBeNull();
	});

	it('renders audit activity as a compact event feed instead of a table', async () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		const activity = screen.getByRole('complementary', { name: 'Settings activity' });
		await fireEvent.click(within(activity).getByRole('tab', { name: 'Audit Log' }));

		expect(within(activity).getByText('Organization › Rename')).toBeTruthy();
		expect(within(activity).getByText('admin@example.com')).toBeTruthy();
		expect(within(activity).getByRole('link', { name: 'View all 1 entries' }).getAttribute('href')).toBe(
			'/org/org-1/settings/audit'
		);
		expect(within(activity).queryByText('Audit action')).toBeNull();
		expect(within(activity).queryByRole('table')).toBeNull();
	});

	it('renders the members tab as a roster-access workspace instead of the old card manager', async () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Members/ }));

		expect(screen.getAllByText('Access Control').length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByRole('heading', { name: 'Members' }).length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('Who can see and edit the roster, and how new invitations are granted.')).toBeTruthy();
		expect(screen.getByRole('link', { name: '+ Invite Member' }).getAttribute('href')).toBe('#invite-member-section');
		expect(screen.getByRole('heading', { name: 'Roster Access' })).toBeTruthy();
		expect(screen.getByText('4 Members')).toBeTruthy();
		expect(screen.getByText('owner@example.com')).toBeTruthy();
		expect(screen.getByText('admin@example.com')).toBeTruthy();
		expect(screen.getByText('member-a@example.com')).toBeTruthy();
		expect(screen.getAllByText('Change Role')).toHaveLength(3);
		expect(screen.getAllByText('Remove')).toHaveLength(3);
		expect(screen.getByRole('heading', { name: 'Invite Member' })).toBeTruthy();
		expect(screen.getByLabelText('Send invitation').getAttribute('placeholder')).toBe('colleague@example.com');
		expect(screen.getByText('Invitee logs in to T2T to accept. No email is sent automatically.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Invite' })).toBeTruthy();
		expect(screen.queryByText('Default group assignment')).toBeNull();
		expect(screen.queryByText('Organization Members')).toBeNull();
		expect(screen.queryByText('Invite New Member')).toBeNull();
	});

	it('renders the policies tab as operational defaults instead of the old policy card', async () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Policies/ }));

		expect(screen.getAllByText('Operational Defaults').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByRole('heading', { name: 'Policies' })).toBeTruthy();
		expect(screen.getByText('Retention windows, warning lead times, and shared expiration thresholds.')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Archive Retention' })).toBeTruthy();
		expect(screen.getByLabelText('Retention period')).toBeTruthy();
		expect(screen.getByText('Archived personnel are automatically purged after this window.')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Loss Warning Window' })).toBeTruthy();
		expect(screen.getByLabelText('Warning lead time')).toBeTruthy();
		expect(screen.getByText('Flag personnel approaching ETS / PCS / DEROS this far out.')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Critical Tasks Defaults' })).toBeTruthy();
		expect(screen.getByLabelText('Default expiration')).toBeTruthy();
		expect(screen.getByText('Used when an ICT task does not define its own override.')).toBeTruthy();
		expect(screen.getByLabelText('Expiring-soon window')).toBeTruthy();
		expect(screen.getByText('Threshold that flips status from current to expiring.')).toBeTruthy();
		expect(screen.getByLabelText('Auto-notify squad leader').hasAttribute('disabled')).toBe(true);
		expect(screen.getByText('Send a daily digest of expiring tasks to assigned NCO.')).toBeTruthy();
		expect(screen.getByText('Coming soon')).toBeTruthy();
		expect(screen.queryByText('Policy Controls')).toBeNull();
		expect(screen.queryByText('Counseling Cadence')).toBeNull();
	});

	it('renders archived personnel as the retention queue without bulk actions', async () => {
		render(Page, {
			props: {
				data: {
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
						},
						{
							id: 'archived-2',
							rank: 'SGT',
							firstName: 'Priya',
							lastName: 'Banks',
							mos: '25B',
							groupName: 'Headquarters Platoon',
							archivedAt: '2026-04-15T12:00:00Z',
							groupId: 'group-2'
						}
					]
				} as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Archived Personnel/ }));

		expect(screen.getAllByText('Retention Queue').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('Records pending automatic deletion. Restore, export, or purge early.')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Archived Records' })).toBeTruthy();
		expect(screen.getByText(/2 Records · 36 mo retention/i)).toBeTruthy();
		const archivedTable = screen.getByRole('region', { name: 'Archived personnel records' });
		expect(within(archivedTable).getByText('Name')).toBeTruthy();
		expect(within(archivedTable).getByText('MOS')).toBeTruthy();
		expect(within(archivedTable).getByText('Group')).toBeTruthy();
		expect(within(archivedTable).getByText('Archived')).toBeTruthy();
		expect(within(archivedTable).getByText('Auto-delete')).toBeTruthy();
		expect(within(archivedTable).getByText('PV2 Abbott, Henry')).toBeTruthy();
		expect(within(archivedTable).getByText('SGT Banks, Priya')).toBeTruthy();
		expect(within(archivedTable).getByText('14 APR 26')).toBeTruthy();
		expect(within(archivedTable).getAllByText('36 mo')).toHaveLength(2);
		expect(within(archivedTable).getAllByRole('button', { name: 'Restore' })).toHaveLength(2);
		expect(within(archivedTable).getAllByRole('button', { name: 'Export' })).toHaveLength(2);
		expect(within(archivedTable).getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
		expect(screen.queryByText('Bulk Restore')).toBeNull();
		expect(screen.queryByText('Bulk Export')).toBeNull();
	});

	it('renders data and export as a backup workspace with supported actions', async () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Data & Export/ }));

		expect(screen.getAllByText('Backup & Migration').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByRole('heading', { name: 'Data & Export' })).toBeTruthy();
		expect(screen.getByText('Move data in and out of T2T. JSON for backups, Excel for human review.')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Export' })).toBeTruthy();
		expect(screen.getByText('Full organization')).toBeTruthy();
		expect(
			screen.getByText('JSON for backups and integrations. Excel for a human-readable workbook with named sheets.')
		).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Export JSON' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Export Excel' })).toBeTruthy();
		expect(screen.getAllByText('Unlimited exports').length).toBeGreaterThanOrEqual(1);
		expect(
			screen.getByText('Full organization exports include roster, training, onboarding, calendar, and duty data.')
		).toBeTruthy();
		expect(screen.getByText('Personnel only')).toBeTruthy();
		expect(screen.getByText('Roster and group data only, without the full organization bundle.')).toBeTruthy();
		const rosterExport = screen.getByRole('button', { name: /Export Roster/ });
		expect(rosterExport.hasAttribute('disabled')).toBe(true);
		expect(rosterExport.textContent).toContain('Coming Soon');
		expect(screen.getByText('Audit log')).toBeTruthy();
		expect(screen.getByText('Last 90 days of activity.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'View Audit Log' }).getAttribute('href')).toBe('/org/org-1/settings/audit');
		const auditExport = screen.getByRole('button', { name: /Export Audit/ });
		expect(auditExport.hasAttribute('disabled')).toBe(true);
		expect(auditExport.textContent).toContain('Coming Soon');
		expect(screen.queryByRole('heading', { name: 'Imports' })).toBeNull();
		expect(screen.queryByText('Bulk personnel import')).toBeNull();
	});

	it('renders danger zone as owner authority rows with future purge support marked clearly', async () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		const dangerNavItem = screen.getByRole('button', { name: /Danger Zone/ });
		expect(dangerNavItem.classList.contains('is-danger')).toBe(true);
		await fireEvent.click(dangerNavItem);

		expect(screen.getAllByText('Owner Authority').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByRole('heading', { name: 'Danger Zone' })).toBeTruthy();
		expect(screen.getByText('Destructive actions that cannot be undone. Owner authentication required.')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Destructive Actions' })).toBeTruthy();
		expect(screen.getByText('Transfer ownership')).toBeTruthy();
		expect(screen.getByText('Hand the Owner role to another member. You will become Admin.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Transfer Ownership' })).toBeTruthy();
		expect(screen.getByText('Purge archived')).toBeTruthy();
		expect(screen.getByText('Permanently delete all archived personnel. Bypasses the retention window.')).toBeTruthy();
		const purgeArchived = screen.getByRole('button', { name: /Purge Archived/ });
		expect(purgeArchived.hasAttribute('disabled')).toBe(true);
		expect(purgeArchived.textContent).toContain('Coming Soon');
		expect(screen.getByText('Delete organization')).toBeTruthy();
		expect(
			screen.getByText(
				'All personnel, training, calendar, and audit data is permanently destroyed. This action cannot be undone.'
			)
		).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Delete Test Org' })).toBeTruthy();
	});

	it('shows billing access in the workspace actions when billing is enabled', () => {
		billingEnabledMock.mockReturnValue(true);

		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		expect(screen.getByRole('link', { name: 'Manage Billing' }).getAttribute('href')).toBe('/org/org-1/billing');
		expect(screen.getByText('Unit tier · $30/mo')).toBeTruthy();
		expect(screen.getByText('4 / UNLIMITED')).toBeTruthy();
	});

	it('collapses and restores the right activity panel without leaving the workspace', async () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
		expect(screen.getByRole('button', { name: 'Show activity panel' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Show activity panel' }));
		expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy();
	});

	it('shows the organization-name saved state only for the rename action payload', () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: { nameSuccess: true } as never
			}
		});

		expect(screen.getByText('Saved')).toBeTruthy();
	});

	it('does not show the organization-name saved state for generic action success payloads', () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: { success: true } as never
			}
		});

		expect(screen.queryByText('Saved')).toBeNull();
	});

	it('allows delete confirmation when the typed name only differs by extra whitespace', async () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Danger Zone/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Test Org' }));
		await fireEvent.input(screen.getByLabelText('Type Test Org to confirm:'), {
			target: { value: '  Test    Org  ' }
		});

		expect((screen.getByRole('button', { name: 'Delete Permanently' }) as HTMLButtonElement).disabled).toBe(false);
	});
});
