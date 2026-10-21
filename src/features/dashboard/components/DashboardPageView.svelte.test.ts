// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import DashboardPageView from './DashboardPageView.svelte';
import { createDashboardScreenModel, type DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { DashboardPageData, StarterConfigurationPackSupport } from '$features/dashboard/contracts';
import { dashboardSection, type DashboardAccess, type QuickAddEntry } from '../sections/dashboardSections';
import { DASHBOARD_SECTIONS } from '../sections/dashboardSectionRegistry';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const access: DashboardAccess = {
	can: () => true
};
const frame = { orgName: 'Test Unit', viewerDay: { date: '2026-10-19', timeZone: 'UTC' }, sections: [], access };

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
		trainingCurrencyPct: 100,
		ratingStats: {
			overdue: 0,
			'due-30': 0,
			'due-60': 0,
			current: 0
		},
		activeOnboardings: [],
		dutyStrengthPct: 100,
		availableCount: 10,
		totalPersonnel: 10,
		groupBreakdown: [],
		nonAvailablePersonnel: [],
		trainingGroupDelinquencies: [],
		personnelCount: 0,
		trainingTypeCount: 0,
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
		const ctx = makeCtx({ availableCount: 42, totalPersonnel: 50 });

		render(DashboardPageView, { props: { ...frame, ctx } });

		expect(screen.queryByRole('toolbar')).toBeNull();
		expect(screen.queryByRole('tablist')).toBeNull();
		expect(screen.getByText('42')).toBeTruthy();
		expect(screen.getByText('/ 50')).toBeTruthy();
	});

	it('does not present unavailable Training as current', () => {
		const ctx = makeCtx({
			trainingStats: null,
			groupBreakdown: [{ id: 'alpha', name: 'Clinic group', pct: 100, total: 1, available: 1, statusCounts: new Map() }]
		});
		render(DashboardPageView, { props: { ...frame, ctx } });
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
		expect(screen.getByText('/ 10')).toBeTruthy();
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
	it('counts expired and expiring Training records in the readiness card', () => {
		const ctx = makeCtx({ trainingStats: { expired: 2, warningOrange: 1, warningYellow: 0, current: 1 } });
		render(DashboardPageView, { props: { ...frame, ctx } });

		const training = screen.getByRole('heading', { name: 'Training & Evaluations' }).closest('[data-slot="card"]')!;
		expect(within(training as HTMLElement).getByText('2 expired')).toBeTruthy();
	});
});

describe('Dashboard feature switches', () => {
	const offFor = (...off: string[]) => ({ isFeatureOn: (feature: string) => !off.includes(feature) });

	it('drops Evaluations from the readiness card when the unit turns them off', () => {
		const ratingStats = { overdue: 2, 'due-30': 1, 'due-60': 0, current: 0 };
		render(DashboardPageView, { props: { ...frame, ctx: makeCtx({ ratingStats }) } });
		expect(screen.getByText('evals overdue')).toBeTruthy();
		cleanup();

		render(DashboardPageView, { props: { ...frame, ctx: makeCtx({ ...offFor('evaluations'), ratingStats }) } });
		expect(screen.getByRole('heading', { name: 'Training' })).toBeTruthy();
		expect(screen.queryByText('evals overdue')).toBeNull();
	});

	it('removes the readiness card when Training and Evaluations are both off', () => {
		render(DashboardPageView, { props: { ...frame, ctx: makeCtx({ ...offFor('evaluations'), trainingStats: null }) } });

		expect(screen.getByText('/ 10')).toBeTruthy();
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
		expect(screen.queryByRole('list', { name: 'Needs you' })).toBeNull();
	});

	it('replaces the bands with the failure and keeps the header', () => {
		const failure = createRawSnippet(() => ({ render: () => '<p role="alert">Dashboard failed</p>' }));
		render(DashboardPageView, { props: { ...frame, ctx: null, failure } });

		expect(screen.getByRole('alert').textContent).toBe('Dashboard failed');
		expect(screen.getByRole('heading', { level: 1, name: 'Monday 19 Oct' })).toBeTruthy();
		expect(screen.queryByRole('status')).toBeNull();
		expect(bands()).toEqual([null, null, null]);
	});

	it('shows ordered usable Quick add entries and hides the label when none are usable', async () => {
		const dialog: QuickAddEntry['dialog'] = () => ({});
		const quickAdd: QuickAddEntry[] = [
			{
				id: 'training',
				label: 'Training',
				order: 20,
				dialog,
				available: (_, viewer) => viewer.can(POLICY_ACTION_CATALOG.training.recordCompletions)
			},
			{
				id: 'status',
				label: 'Status',
				order: 10,
				dialog,
				available: (_, viewer) => viewer.can(POLICY_ACTION_CATALOG.calendar.manageAvailability)
			}
		];
		const props = { ...frame, ctx: makeCtx(), sections: [dashboardSection('availability', { quickAdd })] };
		const view = render(DashboardPageView, { props });

		const group = screen.getByRole('group', { name: 'Quick add' });
		expect(
			within(group)
				.getAllByRole('button')
				.map((button) => button.textContent?.trim())
		).toEqual(['Status', 'Training']);

		await view.rerender({
			...props,
			access: { ...access, can: (action) => action.id === 'calendar.manageAvailability' }
		});
		expect(
			within(screen.getByRole('group', { name: 'Quick add' }))
				.getByRole('button')
				.textContent?.trim()
		).toBe('Status');

		await view.rerender({ ...props, access: { ...access, can: () => false } });
		expect(screen.getByText('/ 10')).toBeTruthy();
		expect(screen.queryByRole('group', { name: 'Quick add' })).toBeNull();
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
		const queue = screen.getByRole('list', { name: 'Needs you' });
		expect(within(queue).getByRole('link', { name: 'SGT Diaz' }).getAttribute('href')).toBe('/org/org-1/personnel/p1');
		expect(within(queue).getByText('Leaving')).toBeTruthy();
		expect(within(queue).getByText('PCS to Fort Hood')).toBeTruthy();
		const lane = screen.getByRole('list', { name: 'Exercises' });
		expect(within(lane).getByText('FTX')).toBeTruthy();
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
	function leaving(index: number) {
		return {
			kind: 'leaving' as const,
			id: `leaving-${index}`,
			personnelId: `p${index}`,
			title: `SGT Person ${index}`,
			subtitle: 'ETS',
			timing: `in ${index} days`,
			href: `/org/org-1/personnel/p${index}`,
			action: null,
			urgency: { date: `2026-10-${String(19 + index).padStart(2, '0')}` }
		};
	}

	function renderQueue(count: number) {
		const many = dashboardSection('lossesAndAwards', {
			needsYou: [() => Array.from({ length: count }, (_, index) => leaving(index + 1))]
		});
		render(DashboardPageView, {
			props: { ...frame, ctx: createDashboardScreenModel(pageData(), { sources }), sections: [many] }
		});
		return screen.getByRole('list', { name: 'Needs you' });
	}

	it('shows nine rows in full without a fold', () => {
		const queue = renderQueue(9);

		expect(within(queue).getAllByRole('link')).toHaveLength(9);
		expect(within(queue).queryByRole('button', { name: /Show all/ })).toBeNull();
	});

	it('folds a tenth row into the top seven and a summary that expands in place', async () => {
		const queue = renderQueue(10);

		expect(within(queue).getAllByRole('link')).toHaveLength(7);
		expect(within(queue).getByText('+3 more')).toBeTruthy();
		expect(within(queue).getByText('SGT Person 8 · SGT Person 9 · SGT Person 10')).toBeTruthy();

		await fireEvent.click(within(queue).getByRole('button', { name: 'Show all 10' }));

		expect(within(queue).getAllByRole('link')).toHaveLength(10);
		expect(within(queue).queryByText('+3 more')).toBeNull();
	});

	it("names tomorrow's duty even when today is open", () => {
		const ctx = createDashboardScreenModel(pageData(), {
			sources: {
				...sources,
				personnel: {
					items: [
						{
							id: 'p1',
							rank: 'SSG',
							lastName: 'Okafor',
							firstName: 'Ada',
							mos: '68W',
							clinicRole: '',
							groupId: null,
							groupName: ''
						}
					],
					loading: false
				},
				dailyAssignments: {
					types: [
						{
							id: 'staff-duty',
							name: 'Staff Duty',
							shortName: 'SD',
							assignTo: 'personnel',
							color: '#1f6feb',
							exemptPersonnelIds: [],
							showOnCalendar: true,
							sortOrder: 0
						}
					],
					assignments: [{ id: 'sd-20', date: '2026-10-20', assignmentTypeId: 'staff-duty', assigneeId: 'p1' }],
					loading: false
				}
			}
		} as Parameters<typeof createDashboardScreenModel>[1]);

		render(DashboardPageView, { props: { ...frame, ctx, sections: DASHBOARD_SECTIONS } });

		const duty = screen.getByRole('row', { name: /Staff Duty/ });
		expect(
			within(duty)
				.getAllByRole('cell')
				.map((cell) => cell.textContent?.trim())
		).toEqual(['Open', 'SSG Okafor']);
		expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent?.trim())).toEqual([
			'Duty',
			'Mon 19',
			'Tue 20'
		]);
	});
});
