// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import DashboardPageView from './DashboardPageView.svelte';
import type { DashboardContext } from '../contexts/DashboardContext.svelte';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function makeCtx(overrides: Record<string, unknown> = {}): DashboardContext {
	const base = {
		data: {
			orgName: 'Test Unit',
			orgId: 'org-1',
			permissions: {
				canViewPersonnel: true,
				canViewCalendar: true,
				canViewTraining: true,
				canViewLeadersBook: true,
				canViewOnboarding: true,
				canEditTraining: true
			},
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 0
		},
		userRole: 'member',
		hasSupportData: true,
		gettingStartedDismissed: true,
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
		data: {
			...base.data,
			...(overrides.data as Record<string, unknown> | undefined)
		}
	} as unknown as DashboardContext;
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
});
