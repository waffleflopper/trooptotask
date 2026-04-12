// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import DashboardPageView from './DashboardPageView.svelte';
import type { DashboardContext } from '../contexts/DashboardContext.svelte';

beforeEach(() => {
	global.fetch = vi.fn(async () => new Response(JSON.stringify({ config: { version: 3, widgets: [] } })));
});

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
		isDemoSandbox: false,
		isDemoReadOnly: false,
		hasSupportData: true,
		gettingStartedDismissed: true,
		isHydrating: false,
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
		todayDisplay: 'Thursday, Apr 2 2026',
		openCustomizeModal: () => {},
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
	it('renders the org name and date in the toolbar', () => {
		const ctx = makeCtx();

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getByText('Test Unit')).toBeTruthy();
		expect(screen.getByText('Thursday, Apr 2 2026')).toBeTruthy();
	});

	it('renders a Customize button when not in configure mode', () => {
		const ctx = makeCtx();

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getByRole('button', { name: /customize/i })).toBeTruthy();
	});

	it('renders skeleton blocks while data is hydrating', () => {
		const ctx = makeCtx({ isHydrating: true });

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getAllByTestId('skeleton-block').length).toBeGreaterThan(0);
	});

	it('does not render the workspace support panel (moved to Getting Started)', () => {
		const ctx = makeCtx({
			userRole: 'owner',
			hasSupportData: false,
			gettingStartedDismissed: false
		});

		render(DashboardPageView, { props: { ctx } });

		expect(screen.queryByText('Workspace support')).toBeNull();
		expect(screen.queryByText('Review checklist')).toBeNull();
	});
});
