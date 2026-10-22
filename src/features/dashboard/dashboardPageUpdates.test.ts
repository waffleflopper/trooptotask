import { describe, expect, it } from 'vitest';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { DashboardPageSummaryData, DashboardWorkspaceResult } from './contracts';
import { getProgress } from '$features/onboarding/contracts';
import { projectTrainingSteps } from './read-model/dashboardIndexes';
import { overlayDashboardRecords, overlayDashboardSummary, putDashboardRecord } from './dashboardPageUpdates';

function packet(id: string, personnelId: string): PersonnelOnboarding {
	return {
		id,
		personnelId,
		startedAt: '2026-10-19',
		status: 'in_progress',
		steps: []
	} as unknown as PersonnelOnboarding;
}

function workspace(activeOnboardings: PersonnelOnboarding[]): DashboardWorkspaceResult {
	return {
		workspaceKey: 'dashboard',
		data: { activeOnboardings },
		hydration: {}
	} as unknown as DashboardWorkspaceResult;
}

describe('the Dashboard record overlay', () => {
	it('adds a saved packet, replaces it when saved again, and leaves the base read untouched', () => {
		const base = workspace([packet('p1', 'alpha')]);
		const first = putDashboardRecord(null, base, { list: 'activeOnboardings', record: packet('p2', 'bravo') });
		const second = putDashboardRecord(first, base, {
			list: 'activeOnboardings',
			record: { ...packet('p2', 'bravo'), startedAt: '2026-10-20' }
		});

		expect(
			overlayDashboardRecords(base, second).data.activeOnboardings.map((p) => [p.id, p.personnelId, p.startedAt])
		).toEqual([
			['p1', 'alpha', '2026-10-19'],
			['p2', 'bravo', '2026-10-20']
		]);
		expect(base.data.activeOnboardings.map((p) => p.id)).toEqual(['p1']);
	});

	it('drops once a newer workspace read arrives, which already includes the saved packet', () => {
		const base = workspace([]);
		const overlay = putDashboardRecord(null, base, { list: 'activeOnboardings', record: packet('p2', 'bravo') });
		const newer = workspace([packet('p2', 'bravo')]);

		expect(overlayDashboardRecords(newer, overlay)).toBe(newer);
		expect(putDashboardRecord(overlay, newer, { list: 'activeOnboardings', record: packet('p3', 'charlie') })).toEqual({
			base: newer,
			changes: [{ list: 'activeOnboardings', record: packet('p3', 'charlie') }]
		});
	});
	it('preserves completed Training when a newly started packet is projected over a summary without that person', () => {
		const base = workspace([]);
		const started: PersonnelOnboarding = {
			...packet('packet-bravo', 'bravo'),
			steps: [
				{
					id: 'step-sharp',
					onboardingId: 'packet-bravo',
					stepName: 'SHARP',
					stepType: 'training',
					trainingTypeId: 'sharp',
					stages: null,
					sortOrder: 0,
					completed: true,
					currentStage: null,
					notes: [],
					templateStepId: 'template-sharp',
					active: true,
					progressChangedAt: '2026-10-19'
				}
			]
		};
		started.steps.push(
			...['Orientation', 'Paperwork'].map((name, i) => ({
				...started.steps[0],
				id: `step-${i}`,
				stepName: name,
				stepType: 'checkbox' as const,
				trainingTypeId: null,
				completed: false
			}))
		);
		const overlay = putDashboardRecord(null, base, { list: 'activeOnboardings', record: started });
		const summary = {
			trainingSummary: {
				stats: {
					total: 2,
					current: 2,
					expired: 0,
					warningOrange: 0,
					warningYellow: 0,
					notCompleted: 0,
					notRequired: 0
				},
				issues: [],
				expiredByType: [],
				expiredPersonnelCount: 0,
				groupDelinquencies: []
			},
			ictlSummary: null,
			onboardingTrainingCompletions: [],
			onboardingPersonnelIds: []
		} satisfies DashboardPageSummaryData;
		const overlaid = overlayDashboardRecords(base, overlay).data.activeOnboardings[0];
		const progress = (next: DashboardPageSummaryData) =>
			getProgress(projectTrainingSteps(overlayDashboardSummary(next, base, overlay))(overlaid));
		expect(progress(summary)).toEqual({ completed: 1, total: 3 });
		const stale = { ...summary, onboardingTrainingCompletions: ['alpha-sharp'] };
		expect(overlayDashboardSummary(stale, base, overlay).onboardingTrainingCompletions).toEqual([
			'alpha-sharp',
			'bravo-sharp'
		]);
		expect(progress(stale)).toEqual({ completed: 1, total: 3 });
		const fresh = { ...summary, onboardingPersonnelIds: ['bravo'], onboardingTrainingCompletions: ['bravo-sharp'] };
		expect(progress(fresh)).toEqual({ completed: 1, total: 3 });
		expect(progress({ ...fresh, onboardingTrainingCompletions: [] })).toEqual({ completed: 0, total: 3 });
	});
});
