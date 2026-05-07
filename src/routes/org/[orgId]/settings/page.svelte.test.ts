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
		createdAt: '2026-04-01T00:00:00Z',
		memberPreset: role === 'member' ? 'editor' : 'editor',
		capabilityOverrides: {},
		accessScopeKind: 'organization',
		accessScopeGroupIds: [],
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
	}
};

describe('org settings page', () => {
	it('renders the shadcn settings shell with summary metrics and shared tabs', () => {
		render(Page, {
			props: {
				data: baseData as never,
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
					...baseData,
					members: [
						member('member-1', 'owner@example.com', 'owner'),
						member('member-2', 'admin@example.com', 'admin'),
						member('member-3', 'member-a@example.com', 'member', {
							memberPreset: 'viewer',
							capabilityOverrides: { calendar: 'operate', ratingScheme: 'none' },
							accessScopeKind: 'groups',
							accessScopeGroupIds: ['group-alpha', 'group-bravo']
						}),
						member('member-4', 'member-b@example.com', 'member')
					]
				} as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Members' }));

		expect(screen.getByRole('heading', { name: 'Access Management' })).toBeTruthy();
		expect(screen.getByText('Member presets do not grant admin authority.')).toBeTruthy();
		expect(screen.getAllByText('member-a@example.com').length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText('Viewer').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('Calendar: Operate')).toBeTruthy();
		expect(screen.getByText('Rating Scheme: None')).toBeTruthy();
		expect(screen.getByText('1st Platoon, 2nd Platoon')).toBeTruthy();
		expect(screen.getAllByRole('button', { name: /Manage Access/ })).toHaveLength(3);

		await fireEvent.click(screen.getAllByRole('button', { name: /Manage Access/ }).at(-1)!);
		const accessPreset = screen.getByRole('combobox', { name: /Access assignment/ }) as HTMLSelectElement;
		const calendarCapability = screen.getByLabelText(
			'Calendar capability for member-b@example.com'
		) as HTMLSelectElement;

		expect(accessPreset.value).toBe('editor');
		expect(calendarCapability.value).toBe('configure');
	});

	it('renders policies with shared controls and validation copy', async () => {
		render(Page, {
			props: {
				data: baseData as never,
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
	});

	it('renders data export controls and the activity panel', async () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Data & Export' }));

		expect(screen.getByRole('heading', { name: 'Data & Export' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Export JSON' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Export Excel' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'View Audit Log' }).getAttribute('href')).toBe('/org/org-1/settings/audit');
		const activity = screen.getByRole('complementary', { name: 'Settings activity' });
		expect(within(activity).getByRole('tab', { name: /Approvals 1/ })).toBeTruthy();
		expect(within(activity).getByText('Delete archived record')).toBeTruthy();
		await fireEvent.click(within(activity).getByRole('tab', { name: 'Audit Log' }));
		expect(within(activity).getByText('Organization › Rename')).toBeTruthy();
	});

	it('renders owner danger controls and guarded delete confirmation', async () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Danger Zone' }));

		expect(screen.getByRole('heading', { name: 'Destructive Actions' })).toBeTruthy();
		expect(screen.getByText('Hand the Owner role to another member. You will become Admin.')).toBeTruthy();
		expect(screen.getByRole('button', { name: /Purge Archived/ }).hasAttribute('disabled')).toBe(true);
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Test Org' }));
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Delete Permanently' }).hasAttribute('disabled')).toBe(true);
		await fireEvent.input(screen.getByLabelText('Type Test Org to confirm'), { target: { value: 'Test Org' } });
		expect(screen.getByRole('button', { name: 'Delete Permanently' }).hasAttribute('disabled')).toBe(false);
	});

	it('shows billing access when billing is enabled', () => {
		billingEnabledMock.mockReturnValue(true);

		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		expect(screen.getByRole('link', { name: 'Manage Billing' }).getAttribute('href')).toBe('/org/org-1/billing');
		expect(screen.getByText('Unit tier · $12/mo')).toBeTruthy();
		expect(screen.getByText('4 / 500')).toBeTruthy();
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
