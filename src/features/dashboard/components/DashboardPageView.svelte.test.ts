// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import DashboardPageView from './DashboardPageView.svelte';
import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { StarterConfigurationPackSupport } from '$lib/types/starterConfigurationPacks';

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
			orgMemberCount: 0,
			dutyRosterTemplateCount: 0,
			dutyRosterRunCount: 0,
			dutyRosterHistoryCount: 0
		},
		userRole: 'member',
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
			availabilityColor: (pct: number) => {
				if (pct >= 90) return 'var(--chart-2)';
				if (pct >= 75) return 'var(--accent)';
				return 'var(--destructive)';
			},
			availPct: 100,
			availColor: 'var(--chart-2)',
			trainingColor: 'var(--chart-2)',
			statusEntries: [],
			upcomingChanges: {
				mode: 'date',
				setMode: () => {},
				byGroup: [],
				byDate: []
			}
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
		ratingTotal: 0,
		activeOnboardings: [],
		upcomingChanges: [],
		upcomingLosses: [],
		upcomingByDate: new Map(),
		dutyAssignments: [],
		todayAdvancedDuty: [],
		dutyStrengthPct: 100,
		availableCount: 10,
		totalPersonnel: 10,
		topTrainingIssues: [],
		groupBreakdown: [],
		nonAvailablePersonnel: [],
		trainingGroupDelinquencies: [],
		personnelCount: 0,
		statusTypeCount: 0,
		trainingTypeCount: 0,
		assignmentTypeCount: 0,
		todayDisplay: 'Thursday, Apr 2 2026',
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
			},
			{
				family: 'duty-roster-template',
				label: 'Duty Roster Template',
				names: ['Staff Duty'],
				description: 'Adds a starter Duty Roster template.'
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

	it('renders the getting started checklist with incomplete and complete items', () => {
		const ctx = makeCtx({
			userRole: 'owner',
			gettingStartedDismissed: false,
			shouldShowGettingStarted: true,
			gettingStartedItems: [
				{
					id: 'personnel',
					label: 'Import or add the roster',
					description: 'Import an Excel/CSV roster or add service members so the dashboard can track strength.',
					href: '/org/org-1/personnel',
					complete: false
				},
				{
					id: 'statuses',
					label: 'Review availability statuses',
					description: 'Review the seeded availability statuses and adjust them for your unit.',
					href: '/org/org-1/calendar/settings',
					complete: true
				}
			]
		});

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getByText('Workspace setup')).toBeTruthy();
		expect(screen.getByText('Import or add the roster')).toBeTruthy();
		expect(screen.getByText('Review availability statuses')).toBeTruthy();
		expect(screen.getByText('1/2 complete')).toBeTruthy();
		expect(screen.getByText('Done')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Open Import or add the roster' }).getAttribute('href')).toBe(
			'/org/org-1/personnel'
		);
	});

	it('renders the starter pack CTA and applies it through the model', async () => {
		const applyStarterConfigurationPack = vi.fn();
		const ctx = makeCtx({
			userRole: 'owner',
			gettingStartedDismissed: false,
			shouldShowGettingStarted: true,
			firstStarterConfigurationPack: makeStarterPack(),
			applyStarterConfigurationPack,
			gettingStartedItems: [
				{
					id: 'training',
					label: 'Add training types',
					description: 'Define the training requirements you want to monitor.',
					href: '/org/org-1/training/types',
					complete: false
				}
			]
		});

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getByText('First Week Operations')).toBeTruthy();
		expect(screen.getByText('Optional')).toBeTruthy();
		expect(screen.getByText('Unit Orientation, Required Annual Training')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: /Apply Pack/i }));

		expect(applyStarterConfigurationPack).toHaveBeenCalledWith('first-week-operations');
	});

	it('shows pending state while applying the starter pack', () => {
		const ctx = makeCtx({
			userRole: 'owner',
			gettingStartedDismissed: false,
			shouldShowGettingStarted: true,
			firstStarterConfigurationPack: makeStarterPack(),
			starterPackApplyState: { status: 'pending', message: null, result: null },
			gettingStartedItems: [
				{
					id: 'training',
					label: 'Add training types',
					description: 'Define the training requirements you want to monitor.',
					href: '/org/org-1/training/types',
					complete: false
				}
			]
		});

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getByRole('button', { name: /Applying/i }).hasAttribute('disabled')).toBe(true);
	});

	it('does not show a starter pack mutation button without configure access', () => {
		const ctx = makeCtx({
			userRole: 'admin',
			gettingStartedDismissed: false,
			shouldShowGettingStarted: true,
			firstStarterConfigurationPack: makeStarterPack({ canApply: false }),
			gettingStartedItems: [
				{
					id: 'training',
					label: 'Add training types',
					description: 'Define the training requirements you want to monitor.',
					href: '/org/org-1/training/types',
					complete: false
				}
			]
		});

		render(DashboardPageView, { props: { ctx } });

		expect(screen.queryByRole('button', { name: /Apply Pack/i })).toBeNull();
		expect(screen.getByText('Configure access needed')).toBeTruthy();
	});

	it('shows starter pack failure copy without changing checklist rendering', () => {
		const ctx = makeCtx({
			userRole: 'owner',
			gettingStartedDismissed: false,
			shouldShowGettingStarted: true,
			firstStarterConfigurationPack: makeStarterPack(),
			starterPackApplyState: {
				status: 'error',
				message: 'Starter pack could not be applied.',
				result: null
			},
			gettingStartedItems: [
				{
					id: 'training',
					label: 'Add training types',
					description: 'Define the training requirements you want to monitor.',
					href: '/org/org-1/training/types',
					complete: false
				}
			]
		});

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getByText('Starter pack could not be applied.')).toBeTruthy();
		expect(screen.getByText('Add training types')).toBeTruthy();
	});

	it('calls the model dismissal method from the checklist', async () => {
		const dismissGettingStarted = vi.fn();
		const ctx = makeCtx({
			userRole: 'admin',
			gettingStartedDismissed: false,
			shouldShowGettingStarted: true,
			dismissGettingStarted,
			gettingStartedItems: [
				{
					id: 'members',
					label: 'Invite another Organization Member',
					description: 'Add at least one more member for shared access.',
					href: '/org/org-1/settings/members',
					complete: false
				}
			]
		});

		render(DashboardPageView, { props: { ctx } });

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

		expect(dismissGettingStarted).toHaveBeenCalledOnce();
	});

	it('does not render the checklist when the model hides it', () => {
		const ctx = makeCtx({
			gettingStartedDismissed: true,
			shouldShowGettingStarted: false,
			gettingStartedItems: [
				{
					id: 'personnel',
					label: 'Import or add the roster',
					description: 'Import an Excel/CSV roster or add service members so the dashboard can track strength.',
					href: '/org/org-1/personnel',
					complete: false
				}
			]
		});

		render(DashboardPageView, { props: { ctx } });

		expect(screen.queryByText('Workspace setup')).toBeNull();
		expect(screen.queryByText('Import or add the roster')).toBeNull();
	});
});
