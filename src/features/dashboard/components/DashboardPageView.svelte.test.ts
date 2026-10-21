// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet, type Component } from 'svelte';
import DashboardPageView from './DashboardPageView.svelte';
import { createDashboardScreenModel, type DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { DashboardPageData, StarterConfigurationPackSupport } from '$features/dashboard/contracts';
import { dashboardSection, type QuickAddEntry } from '../sections/dashboardSections';
import { DASHBOARD_SECTIONS } from '../sections/dashboardSectionRegistry';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const frame = { orgName: 'Test Unit', viewerDay: { date: '2026-10-19', timeZone: 'UTC' }, sections: [] };

function makeCtx(overrides: Record<string, unknown> = {}): DashboardScreenModel {
	const starterPack = overrides.firstStarterConfigurationPack as StarterConfigurationPackSupport | null | undefined;
	const base = {
		data: {
			orgName: 'Test Unit',
			orgId: 'org-1',
			disabledFeatures: [],
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 0
		},
		userRole: 'member',
		isFeatureOn: () => true,
		hasSupportData: true,
		gettingStartedDismissed: true,
		gettingStartedItems: [],
		shouldShowGettingStarted: false,
		firstStarterConfigurationPack: null,
		starterConfigurationPacks: [],
		starterPackApplyState: { status: 'idle', message: null, result: null },
		applyStarterConfigurationPack: () => {},
		isHydrating: false,
		statusBreakdown: new Map(),
		unitReadiness: {
			availabilityColor: () => 'var(--success-foreground)',
			trainingCurrencyColor: () => 'var(--success-foreground)',
			availPct: 100,
			availColor: 'var(--success-foreground)',
			trainingColor: 'var(--success-foreground)',
			statusEntries: []
		},
		trainingStats: {
			expired: 0,
			warningOrange: 0,
			warningYellow: 0,
			current: 0
		},
		expiredTrainingPersonnelCount: 0,
		trainingCurrencyPct: 100,
		ratingStats: {
			overdue: 0,
			'due-30': 0,
			'due-60': 0,
			current: 0
		},
		activeOnboardings: [],
		upcomingChanges: [],
		upcomingLosses: [],
		dutyStrengthPct: 100,
		availableCount: 10,
		totalPersonnel: 10,
		groupBreakdown: [],
		nonAvailablePersonnel: [],
		trainingGroupDelinquencies: [],
		personnelCount: 0,
		trainingTypeCount: 0,
		formatShortDate: (date: string) => date,
		dutyForDays: () => [],
		dismissGettingStarted: () => {},
		forecastDays: [],
		inputs: { forecastDays: [] }
	};

	return {
		...base,
		...overrides,
		starterConfigurationPacks: starterPack ? [starterPack] : (overrides.starterConfigurationPacks ?? []),
		data: {
			...base.data,
			...(overrides.data as Record<string, unknown> | undefined)
		}
	} as unknown as DashboardScreenModel;
}

function makeStarterPack(overrides: Partial<StarterConfigurationPackSupport> = {}): StarterConfigurationPackSupport {
	return {
		id: 'first-week-operations',
		name: 'First Week Operations',
		description: 'Optional starter configuration for common first-week setup.',
		editableCopy: 'Creates editable workflow configuration artifacts.',
		artifacts: [
			{
				family: 'training-types',
				label: 'Training Types',
				names: ['Unit Orientation', 'Required Annual Training'],
				description: 'Adds starter training requirements.'
			},
			{
				family: 'onboarding-template',
				label: 'Onboarding Template',
				names: ['New Arrival Packet'],
				description: 'Adds a starter onboarding template.'
			}
		],
		readiness: [],
		canApply: true,
		deniedActions: [],
		isFullyApplied: false,
		...overrides
	};
}

describe('DashboardPageView', () => {
	it('renders the overview directly without tabs or toolbar', () => {
		const ctx = makeCtx();

		render(DashboardPageView, { props: { ...frame, ctx } });

		expect(screen.queryByRole('toolbar')).toBeNull();
		expect(screen.queryByRole('tablist')).toBeNull();
	});

	it('renders overview content when not hydrating', () => {
		const ctx = makeCtx({ availableCount: 42, totalPersonnel: 50 });

		render(DashboardPageView, { props: { ...frame, ctx } });

		expect(screen.getByText('42')).toBeTruthy();
		expect(screen.getByText('/ 50')).toBeTruthy();
	});

	it('keeps saved Calendar assignments visible without presenting unavailable Training as current', () => {
		const ctx = makeCtx({
			trainingStats: null,
			groupBreakdown: [
				{ id: 'alpha', name: 'Clinic group', pct: 100, total: 1, available: 1, statusCounts: new Map() }
			],
			dutyForDays: () => [
				{
					date: '2026-09-21',
					label: 'Today',
					isToday: true,
					assignments: [{ id: 'saved', typeName: 'Clinic Coverage', assigneeName: 'Alpha' }]
				}
			]
		});
		render(DashboardPageView, { props: { ...frame, ctx } });
		expect(screen.getByText('Clinic Coverage')).toBeTruthy();
		expect(screen.getByText('Alpha')).toBeTruthy();
		expect(screen.queryByText('training current')).toBeNull();
		const evaluations = screen.getByRole('heading', { name: 'Evaluations' }).closest('[data-slot="card"]')!;
		expect(within(evaluations as HTMLElement).queryByText('Clinic group')).toBeNull();
		expect(screen.getByText('Clinic group')).toBeTruthy();
	});

	it('keeps Workspace Setup and its starter pack hidden even for an eligible owner', () => {
		const ctx = makeCtx({
			userRole: 'owner',
			gettingStartedDismissed: false,
			shouldShowGettingStarted: true,
			firstStarterConfigurationPack: makeStarterPack(),
			gettingStartedItems: [
				{
					id: 'personnel',
					label: 'Import or add the roster',
					description: 'Add the roster.',
					href: '/org/org-1/personnel',
					complete: false
				}
			]
		});
		render(DashboardPageView, { props: { ...frame, ctx } });
		expect(screen.queryByRole('progressbar', { name: 'Workspace setup progress' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Open Import or add the roster' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
		expect(screen.queryByRole('button', { name: /Apply Pack/i })).toBeNull();
	});
});

describe('Dashboard Training attention', () => {
	it.each([
		{ total: 2, pct: 50 },
		{ total: 8, pct: 88 }
	])('renders Group Training currency independently of availability: $pct%', ({ total, pct }) => {
		const ctx = makeCtx({
			trainingStats: { expired: 1, warningOrange: 0, warningYellow: 0, current: 1 },
			groupBreakdown: [{ id: 'alpha', name: 'Alpha', pct: 100, total, available: total, statusCounts: new Map() }],
			trainingGroupDelinquencies: [
				{ groupId: 'alpha', groupName: 'Alpha', count: 1, expiredPersonnelCount: 1, pct: 50 }
			]
		});
		render(DashboardPageView, { props: { ...frame, ctx } });
		const training = screen.getByRole('heading', { name: 'Training & Evaluations' }).closest('[data-slot="card"]')!;
		const group = within(training as HTMLElement).getByText('Alpha').parentElement!;
		expect(within(group).getByText(`${pct}%`)).toBeTruthy();
		expect(within(group).queryByText('100%')).toBeNull();
	});
	it('shows the distinct expired-person total and expired-only groups while retaining record warnings', () => {
		const ctx = makeCtx({
			trainingStats: { expired: 2, warningOrange: 1, warningYellow: 0, current: 1 },
			expiredTrainingPersonnelCount: 1,
			trainingGroupDelinquencies: [
				{ groupId: 'alpha', groupName: 'Alpha', count: 1, expiredPersonnelCount: 0, pct: 100 },
				{ groupId: 'bravo', groupName: 'Bravo', count: 1, expiredPersonnelCount: 1, pct: 100 }
			]
		});
		render(DashboardPageView, { props: { ...frame, ctx } });

		expect(screen.getByText('1 personnel with expired training')).toBeTruthy();
		expect(screen.getByText('Bravo (1)')).toBeTruthy();
		expect(screen.queryByText(/Alpha \(1\)/)).toBeNull();
		expect(screen.getByText('2 expired')).toBeTruthy();
		expect(screen.getByText('1 training items expiring soon')).toBeTruthy();
	});
});

describe('Dashboard feature switches', () => {
	const offFor = (...off: string[]) => ({ isFeatureOn: (feature: string) => !off.includes(feature) });

	it('drops Evaluations from the readiness card and Requires Attention when the unit turns them off', () => {
		const ratingStats = { overdue: 2, 'due-30': 1, 'due-60': 0, current: 0 };
		render(DashboardPageView, { props: { ...frame, ctx: makeCtx({ ratingStats }) } });
		expect(screen.getByText('2 overdue evaluations')).toBeTruthy();
		expect(screen.getByText('1 evaluation due within 30 days')).toBeTruthy();
		cleanup();

		render(DashboardPageView, { props: { ...frame, ctx: makeCtx({ ...offFor('evaluations'), ratingStats }) } });
		expect(screen.getByRole('heading', { name: 'Training' })).toBeTruthy();
		expect(screen.queryByText('2 overdue evaluations')).toBeNull();
		expect(screen.queryByText('1 evaluation due within 30 days')).toBeNull();
	});

	it('removes the readiness card when Training and Evaluations are both off', () => {
		render(DashboardPageView, { props: { ...frame, ctx: makeCtx({ ...offFor('evaluations'), trainingStats: null }) } });

		expect(screen.queryByRole('heading', { name: /Training|Evaluations/ })).toBeNull();
	});

	it('removes the Onboarding card when the unit turns Onboarding off', () => {
		render(DashboardPageView, { props: { ...frame, ctx: makeCtx(offFor('onboarding')) } });

		expect(screen.queryByRole('heading', { name: 'Onboarding' })).toBeNull();
		expect(screen.getByRole('heading', { name: 'Training & Evaluations' })).toBeTruthy();
	});
});

function bands() {
	return ['Strength', 'Action', 'Readiness'].map((name) => screen.queryByRole('region', { name }));
}

describe('Dashboard frame', () => {
	it('names the viewer day and the unit, and counts personnel once the model is ready', () => {
		render(DashboardPageView, { props: { ...frame, ctx: makeCtx({ totalPersonnel: 42 }) } });

		expect(screen.getByRole('heading', { level: 1, name: 'Monday 19 Oct' })).toBeTruthy();
		expect(screen.getByText('Dashboard · Test Unit · 42 personnel')).toBeTruthy();
		expect(bands().map((band) => band?.getAttribute('aria-busy'))).toEqual(['false', 'false', 'false']);
		expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
	});

	it.each([
		{ state: 'pending', ctx: null },
		{ state: 'hydrating', ctx: makeCtx({ isHydrating: true }) }
	])('holds every band in a skeleton while the model is $state', ({ ctx }) => {
		render(DashboardPageView, { props: { ...frame, ctx } });

		expect(screen.getByRole('status').textContent).toBe('Loading Dashboard');
		expect(screen.getByRole('heading', { level: 1, name: 'Monday 19 Oct' })).toBeTruthy();
		expect(screen.getByText('Dashboard · Test Unit')).toBeTruthy();
		for (const band of bands()) {
			expect(band?.getAttribute('aria-busy')).toBe('true');
			expect(band?.querySelector('[data-slot="skeleton"]')).not.toBeNull();
		}
		expect(screen.queryByText('Requires Attention')).toBeNull();
	});

	it('replaces the bands with the failure and keeps the header', () => {
		const failure = createRawSnippet(() => ({ render: () => '<p role="alert">Dashboard failed</p>' }));
		render(DashboardPageView, { props: { ...frame, ctx: null, failure } });

		expect(screen.getByRole('alert').textContent).toBe('Dashboard failed');
		expect(screen.getByRole('heading', { level: 1, name: 'Monday 19 Oct' })).toBeTruthy();
		expect(screen.queryByRole('status')).toBeNull();
		expect(bands()).toEqual([null, null, null]);
	});

	it('shows Quick add only when a section offers an entry', () => {
		render(DashboardPageView, { props: { ...frame, ctx: makeCtx() } });
		expect(screen.queryByRole('group', { name: 'Quick add' })).toBeNull();
		cleanup();

		const dialog = (() => {}) as unknown as QuickAddEntry['dialog'];
		const quickAdd: QuickAddEntry[] = [
			{ id: 'status', label: 'Status', dialog },
			{ id: 'training', label: 'Training', dialog }
		];
		render(DashboardPageView, {
			props: { ...frame, ctx: makeCtx(), sections: [dashboardSection('availability', { quickAdd })] }
		});

		const group = screen.getByRole('group', { name: 'Quick add' });
		expect(
			within(group)
				.getAllByRole('button')
				.map((button) => button.textContent?.trim())
		).toEqual(['Status', 'Training']);
	});
});

describe('Dashboard sections', () => {
	function pageData(): DashboardPageData {
		return {
			orgId: 'org-1',
			orgName: 'Test Unit',
			userId: 'user-1',
			viewerDay: { date: '2026-10-19', timeZone: 'UTC' },
			disabledFeatures: [],
			dashboard: {
				workspaceKey: 'dashboard',
				data: {
					availabilityEntries: [],
					assignmentTypes: [],
					todayAssignments: [],
					range: { rangeStart: '2026-10-17', rangeEnd: '2026-11-03' },
					pinnedGroups: [],
					activeOnboardings: [],
					ratingSchemeEntries: [],
					personnel: [],
					groups: [],
					statusTypes: [],
					trainingTypes: [],
					lossWarningWindowDays: 180,
					strengthFloorPercent: 80,
					awardTrackingAcknowledgedPersonnelIds: []
				},
				hydration: { orgId: 'org-1' } as DashboardPageData['dashboard']['hydration']
			},
			trainingSummary: null,
			ictlSummary: null,
			onboardingTrainingCompletions: []
		};
	}

	const sources = {
		personnel: { items: [], loading: false },
		statusTypes: { items: [], loading: false },
		availability: { items: [], loading: false },
		dailyAssignments: { assignments: [], types: [], loading: false },
		groups: { items: [], loading: false },
		pinnedGroups: { list: [] }
	};

	it('renders a section that registers a Needs you source and a forecast lane without changing the bands', () => {
		const exercises = dashboardSection('criticalTasks', {
			needsYou: [
				(inputs) => [
					{
						kind: 'leaving',
						id: 'leaving-p1',
						personnelId: 'p1',
						title: 'SGT Diaz',
						subtitle: 'PCS to Fort Hood',
						timing: 'in 3 days',
						href: '/org/org-1/personnel/p1',
						action: null,
						urgency: { date: inputs.forecastDays[3] }
					}
				]
			],
			forecastLanes: [
				{
					id: 'exercises',
					label: 'Exercises',
					marks: () => [
						{ kind: 'span', id: 'ftx', start: '2026-10-20', end: '2026-10-22', label: 'FTX', emphasis: 'strong' }
					]
				}
			]
		});
		const sections = DASHBOARD_SECTIONS.map((entry) => (entry.id === 'criticalTasks' ? exercises : entry));
		const ctx = createDashboardScreenModel(pageData(), { sources });

		render(DashboardPageView, { props: { ...frame, ctx, sections } });

		expect(screen.getByText('Needs you · 1')).toBeTruthy();
		const row = within(screen.getByRole('list', { name: 'Needs you' })).getByRole('link');
		expect(row.getAttribute('href')).toBe('/org/org-1/personnel/p1');
		expect(row.textContent).toContain('SGT Diaz');
		const lane = screen.getByRole('list', { name: 'Exercises' });
		expect(within(lane).getByText('FTX').closest('li')?.style.gridColumn).toBe('2 / span 3');
		expect(bands().every((band) => band?.getAttribute('aria-busy') === 'false')).toBe(true);
	});

	it('drops a switched-off section with its row and lane', () => {
		const exercises = dashboardSection('criticalTasks', {
			needsYou: [
				() => [
					{
						kind: 'leaving',
						id: 'leaving-p1',
						personnelId: 'p1',
						title: 'SGT Diaz',
						subtitle: 'PCS',
						timing: 'in 3 days',
						href: '/org/org-1/personnel/p1',
						action: null,
						urgency: { date: '2026-10-22' }
					}
				]
			],
			forecastLanes: [{ id: 'exercises', label: 'Exercises', marks: () => [] }]
		});
		const ctx = createDashboardScreenModel({ ...pageData(), disabledFeatures: ['criticalTasks'] }, { sources });

		render(DashboardPageView, { props: { ...frame, ctx, sections: [exercises] } });

		expect(screen.getByText('Nothing needs you right now.')).toBeTruthy();
		expect(screen.queryByRole('list', { name: 'Exercises' })).toBeNull();
	});
});
