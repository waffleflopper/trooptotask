// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import DashboardPageView from './DashboardPageView.svelte';
import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { StarterConfigurationPackSupport } from '$features/dashboard/contracts';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function makeCtx(overrides: Record<string, unknown> = {}): DashboardScreenModel {
	const starterPack = overrides.firstStarterConfigurationPack as StarterConfigurationPackSupport | null | undefined;
	const base = {
		data: {
			orgName: 'Test Unit',
			orgId: 'org-1',
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
		dismissGettingStarted: () => {}
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

		render(DashboardPageView, { props: { ctx } });

		expect(screen.queryByRole('toolbar')).toBeNull();
		expect(screen.queryByRole('tablist')).toBeNull();
	});

	it('renders skeleton blocks while data is hydrating', () => {
		const ctx = makeCtx({ isHydrating: true });

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getAllByTestId('skeleton-block').length).toBeGreaterThan(0);
	});

	it('renders overview content when not hydrating', () => {
		const ctx = makeCtx({ availableCount: 42, totalPersonnel: 50 });

		render(DashboardPageView, { props: { ctx } });

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
		render(DashboardPageView, { props: { ctx } });
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
		render(DashboardPageView, { props: { ctx } });
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
		render(DashboardPageView, { props: { ctx } });
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
		render(DashboardPageView, { props: { ctx } });

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
		render(DashboardPageView, { props: { ctx: makeCtx({ ratingStats }) } });
		expect(screen.getByText('2 overdue evaluations')).toBeTruthy();
		expect(screen.getByText('1 evaluation due within 30 days')).toBeTruthy();
		cleanup();

		render(DashboardPageView, { props: { ctx: makeCtx({ ...offFor('evaluations'), ratingStats }) } });
		expect(screen.getByRole('heading', { name: 'Training' })).toBeTruthy();
		expect(screen.queryByText('2 overdue evaluations')).toBeNull();
		expect(screen.queryByText('1 evaluation due within 30 days')).toBeNull();
	});

	it('removes the readiness card when Training and Evaluations are both off', () => {
		render(DashboardPageView, { props: { ctx: makeCtx({ ...offFor('evaluations'), trainingStats: null }) } });

		expect(screen.queryByRole('heading', { name: /Training|Evaluations/ })).toBeNull();
	});

	it('removes the Onboarding card when the unit turns Onboarding off', () => {
		render(DashboardPageView, { props: { ctx: makeCtx(offFor('onboarding')) } });

		expect(screen.queryByRole('heading', { name: 'Onboarding' })).toBeNull();
		expect(screen.getByRole('heading', { name: 'Training & Evaluations' })).toBeTruthy();
	});
});
