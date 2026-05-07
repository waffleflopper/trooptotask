// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import DashboardPageView from './DashboardPageView.svelte';
import type { DashboardContext } from '../contexts/DashboardContext.svelte';
import { dashboardTabStore } from '../stores/dashboardTabStore.svelte';

beforeEach(() => {
	global.fetch = vi.fn(async () => new Response(JSON.stringify({ config: { version: 3, widgets: [] } })));
});

afterEach(() => {
	cleanup();
	dashboardTabStore.setTab('unit-readiness');
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
		unitReadiness: {
			availabilityColor: (pct: number) => {
				if (pct >= 90) return 'var(--success)';
				if (pct >= 75) return 'var(--amber)';
				return 'var(--danger)';
			},
			availPct: 100,
			availColor: 'var(--success)',
			trainingColor: 'var(--success)',
			statusEntries: [],
			upcomingChanges: {
				mode: 'date',
				setMode: () => {},
				byGroup: [],
				byDate: []
			}
		},
		peopleDuty: {
			today: undefined,
			tomorrow: undefined,
			dutyDays: [],
			outToday: {
				mode: 'status',
				setMode: () => {},
				byStatus: [],
				byGroup: []
			},
			upcomingChanges: {
				mode: 'date',
				setMode: () => {},
				byGroup: [],
				byDate: []
			}
		},
		trainingEvals: {
			evalsDueSoon: [],
			trainingColor: 'var(--success)',
			hasTrainingIssues: false,
			delinquencies: [],
			maxGroupCount: 1,
			groupedIndividuals: [],
			ictl: {
				state: 'hidden'
			}
		},
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
		upcomingLosses: [],
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
		formatShortDate: (date: string) => date,
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
	it('renders dashboard tabs in a floating toolbar without an in-body route title', () => {
		const ctx = makeCtx();

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getByRole('toolbar', { name: 'Dashboard controls' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Test Unit' })).toBeNull();
		expect(screen.queryByRole('status', { name: 'Thursday, Apr 2 2026' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Thursday, Apr 2 2026' })).toBeNull();
	});

	it('renders active dashboard quick actions in the toolbar action area', () => {
		dashboardTabStore.setTab('training-evals');
		const ctx = makeCtx({
			data: {
				permissions: {
					canViewTraining: true,
					canViewRatingScheme: true
				}
			}
		});

		render(DashboardPageView, { props: { ctx } });

		const toolbar = screen.getByRole('toolbar', { name: 'Dashboard controls' });
		expect(screen.getByRole('group', { name: 'Dashboard quick actions' })).toBeTruthy();
		expect(within(toolbar).getByRole('link', { name: 'Record Training' }).getAttribute('href')).toBe(
			'/org/org-1/training'
		);
		expect(within(toolbar).getByRole('link', { name: 'Add Eval' }).getAttribute('href')).toBe('/org/org-1/evals');
	});

	it('renders the three dashboard tabs', () => {
		const ctx = makeCtx();

		render(DashboardPageView, { props: { ctx } });

		expect(screen.getByRole('tab', { name: /unit readiness/i })).toBeTruthy();
		expect(screen.getByRole('tab', { name: /people & duty/i })).toBeTruthy();
		expect(screen.getByRole('tab', { name: /training & evals/i })).toBeTruthy();
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

	it('renders the compact ICTL dashboard item instead of the old placeholder for Critical Tasks viewers', async () => {
		global.fetch = vi.fn(
			async () => new Response(JSON.stringify({ config: { version: 3, widgets: [], defaultTab: 'training-evals' } }))
		);
		dashboardTabStore.setTab('training-evals');
		const ctx = makeCtx({
			data: {
				permissions: {
					canViewTraining: true,
					canViewRatingScheme: true,
					canViewCriticalTasks: true
				}
			},
			trainingEvals: {
				evalsDueSoon: [],
				trainingColor: 'var(--success)',
				hasTrainingIssues: false,
				delinquencies: [],
				maxGroupCount: 1,
				groupedIndividuals: [],
				ictl: {
					state: 'ready',
					readinessColor: 'var(--danger)',
					readinessLabel: '68% ready',
					deltaLabel: 'down 4 pts vs 30d',
					readyCount: 17,
					applicableCount: 25,
					primaryConcern: '3 of 8 Soldiers below 70%',
					expiringSoonLabel: '5 tasks expiring <=60d across 4 Soldiers',
					tasksBelowThresholdLabel: '2 tasks below unit threshold',
					projectedReadinessLabel: '64% projected in 6 months',
					mosReadiness: [{ mos: '11B', personnelCount: 5, readinessPercent: 60 }],
					tasksBelowThreshold: [
						{
							taskId: 'task-1',
							taskCode: 'ICT-1',
							taskName: 'React to contact',
							percentComplete: 40,
							soldierGapCount: 3
						}
					],
					atRiskSoldiers: [
						{
							personnelId: 'person-1',
							soldierName: 'Smith, Ann',
							mos: '11B',
							rank: 'SGT',
							groupName: 'Alpha',
							readinessPercent: 50,
							tasksExpiringSoonCount: 1,
							daysSinceLastIctUpdate: 45
						}
					],
					reportHref: '/org/org-1/critical-tasks/reports'
				}
			}
		});

		render(DashboardPageView, { props: { ctx } });

		expect(await screen.findByRole('region', { name: 'Critical Tasks summary' })).toBeTruthy();
		expect(screen.queryByText(/coming soon/i)).toBeNull();
		expect(screen.getByText('68% ready')).toBeTruthy();
		expect(screen.getByText('3 of 8 Soldiers below 70%')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Open reports' }).getAttribute('href')).toBe(
			'/org/org-1/critical-tasks/reports'
		);
	});
});
