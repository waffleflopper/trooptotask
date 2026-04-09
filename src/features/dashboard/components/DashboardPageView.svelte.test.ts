// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import DashboardPageView from './DashboardPageView.svelte';
import type { DashboardContext } from '../contexts/DashboardContext.svelte';

afterEach(() => {
	cleanup();
});

function makeCtx(overrides: Record<string, unknown> = {}): DashboardContext {
	const base = {
		data: {
			orgName: 'Test Unit',
			orgId: 'org-1',
			permissions: {
				canViewPersonnel: true,
				canEditTraining: true
			},
			onboardingTemplateStepCount: 0,
			ratingSchemeEntryCount: 0,
			orgMemberCount: 0
		},
		userRole: 'member',
		isDemoSandbox: false,
		isDemoReadOnly: false,
		gettingStartedDismissed: true,
		statusBreakdown: new Map(),
		trainingStats: {
			expired: 0,
			warningOrange: 0,
			warningYellow: 0,
			current: 0
		},
		ratingStats: {
			overdue: 0,
			'due-30': 0,
			'due-60': 0,
			current: 0
		},
		ratingTotal: 0,
		cardRows: [['strength']],
		activeOnboardings: [],
		upcomingChanges: [],
		upcomingByDate: new Map(),
		dutyAssignments: [],
		dutyStrengthPct: 100,
		availableCount: 10,
		totalPersonnel: 10,
		topTrainingIssues: [],
		groupBreakdown: [],
		personnelCount: 0,
		statusTypeCount: 0,
		trainingTypeCount: 0,
		assignmentTypeCount: 0,
		todayDisplay: 'Apr 2, 2026',
		openCustomizeModal: () => {},
		dismissGettingStarted: () => {},
		formatShortDate: (date: string) => date
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
	it('renders a loading placeholder while composite data is hydrating', () => {
		const ctx = makeCtx({
			isHydrating: true
		});

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getByText('Loading dashboard data')).toBeTruthy();
		expect(screen.getAllByTestId('skeleton-block').length).toBeGreaterThan(0);
		expect(screen.getAllByTestId('skeleton-line').length).toBeGreaterThan(0);
		expect(
			screen.queryByText('No dashboard modules are visible. Use Customize to restore the default layout.')
		).toBeNull();
		expect(screen.queryByText('Test Unit')).toBeNull();
	});

	it('preserves customized card order when rendering dashboard columns', () => {
		const ctx = makeCtx({
			cardRows: [['onboardings'], ['ratings'], ['strength']],
			ratingStats: {
				overdue: 1,
				'due-30': 0,
				'due-60': 0,
				current: 0
			},
			ratingTotal: 1
		});

		render(DashboardPageView, { props: { ctx } });

		const cardHeadings = screen
			.getAllByRole('heading', { level: 3 })
			.map((heading) => heading.textContent?.trim())
			.filter((text): text is string =>
				['Active onboardings', 'Rating watch', "Today's strength"].includes(text ?? '')
			);

		expect(cardHeadings).toEqual(['Active onboardings', 'Rating watch', "Today's strength"]);
	});

	it('renders the groups card when group breakdown data exists', () => {
		const ctx = makeCtx({
			cardRows: [['groups']],
			groupBreakdown: [
				{
					id: 'group-1',
					name: 'Alpha',
					total: 12,
					available: 9,
					pct: 75,
					statusCounts: new Map([['tdy', 3]]),
					isPinned: true
				}
			]
		});

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getByRole('heading', { level: 3, name: 'Per-group breakdown' })).toBeTruthy();
		expect(screen.getByText('Alpha')).toBeTruthy();
		expect(screen.getByText('75%')).toBeTruthy();
	});
});
