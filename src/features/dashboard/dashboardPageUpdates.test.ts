import { describe, expect, it } from 'vitest';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import type { DashboardPageSummaryData, DashboardWorkspaceResult } from './contracts';
import { getProgress } from '$features/onboarding/contracts';
import { projectTrainingSteps } from './read-model/dashboardIndexes';
import type { DashboardRecordChange, DashboardRecordOverlay } from './dashboardPageUpdates';
import {
	overlayDashboardRecords,
	overlayDashboardSummary,
	putDashboardRecord,
	retireTrainingCompletions
} from './dashboardPageUpdates';

function packet(id: string, personnelId: string): PersonnelOnboarding {
	return {
		id,
		personnelId,
		startedAt: '2026-10-19',
		status: 'in_progress',
		steps: []
	} as unknown as PersonnelOnboarding;
}

function workspace(
	activeOnboardings: PersonnelOnboarding[],
	more: { ratingSchemeEntries?: RatingSchemeDueEntry[]; awardTrackingAcknowledgedPersonnelIds?: string[] } = {}
): DashboardWorkspaceResult {
	return {
		workspaceKey: 'dashboard',
		data: { activeOnboardings, ratingSchemeEntries: [], awardTrackingAcknowledgedPersonnelIds: [], ...more },
		hydration: {}
	} as unknown as DashboardWorkspaceResult;
}

function entry(status: RatingSchemeDueEntry['status']): RatingSchemeDueEntry {
	return { id: 'e1', ratedPersonId: 'alpha', evalType: 'NCOER', ratingPeriodEnd: '2026-09-30', status };
}

function expiredSummary(
	expiredByType: Array<{ trainingTypeId: string; personnelIds: string[] }>
): DashboardPageSummaryData {
	return {
		trainingSummary: {
			stats: { total: 4 },
			issues: [],
			expiredByType: expiredByType.map((expired) => ({ ...expired, maxDaysLate: 12 })),
			expiredPersonnelCount: 3,
			groupDelinquencies: []
		},
		ictlSummary: null,
		onboardingTrainingCompletions: [],
		onboardingPersonnelIds: []
	} as unknown as DashboardPageSummaryData;
}

function put(
	overlay: DashboardRecordOverlay | null,
	base: DashboardWorkspaceResult,
	change: DashboardRecordChange,
	saveNumber = 1
) {
	return putDashboardRecord(overlay, base, change, saveNumber);
}

describe('the Dashboard record overlay', () => {
	it('adds a saved packet, replaces it when saved again, and leaves the base read untouched', () => {
		const base = workspace([packet('p1', 'alpha')]);
		const first = put(null, base, { list: 'activeOnboardings', record: packet('p2', 'bravo') });
		const second = put(first, base, {
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
		const overlay = put(null, base, { list: 'activeOnboardings', record: packet('p2', 'bravo') });
		const newer = workspace([packet('p2', 'bravo')]);

		expect(overlayDashboardRecords(newer, overlay)).toBe(newer);
		expect(put(overlay, newer, { list: 'activeOnboardings', record: packet('p3', 'charlie') })).toEqual({
			base: newer,
			changes: [{ change: { list: 'activeOnboardings', record: packet('p3', 'charlie') }, saveNumber: 1 }]
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
		const overlay = put(null, base, { list: 'activeOnboardings', record: started });
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

	it('replaces a saved evaluation and adds an acknowledged award once', () => {
		const base = workspace([], {
			ratingSchemeEntries: [entry('active')],
			awardTrackingAcknowledgedPersonnelIds: ['bravo']
		});
		let overlay = put(null, base, { list: 'ratingSchemeEntries', record: entry('completed') });
		for (let i = 0; i < 2; i++) {
			overlay = put(overlay, base, {
				list: 'awardTrackingAcknowledgedPersonnelIds',
				personnelId: 'alpha'
			});
		}

		const data = overlayDashboardRecords(base, overlay).data;
		expect(data.ratingSchemeEntries).toEqual([entry('completed')]);
		expect(data.awardTrackingAcknowledgedPersonnelIds).toEqual(['bravo', 'alpha']);
	});

	it('takes recorded People off their type in the summary and drops a type once nobody is left', () => {
		const base = workspace([]);
		const summary = expiredSummary([
			{ trainingTypeId: 'cpr', personnelIds: ['okafor', 'brooks', 'liang'] },
			{ trainingTypeId: 'sharp', personnelIds: ['kim'] }
		]);
		let overlay = put(null, base, {
			list: 'trainingCompletions',
			trainingTypeId: 'cpr',
			personnelIds: ['okafor']
		});
		overlay = put(overlay, base, {
			list: 'trainingCompletions',
			trainingTypeId: 'sharp',
			personnelIds: ['kim']
		});

		expect(overlayDashboardSummary(summary, base, overlay).trainingSummary?.expiredByType).toEqual([
			{ trainingTypeId: 'cpr', personnelIds: ['brooks', 'liang'], maxDaysLate: 12 }
		]);
		expect(overlayDashboardRecords(base, overlay).data).toEqual(base.data);
		expect(summary.trainingSummary?.expiredByType.map((expired) => expired.personnelIds)).toEqual([
			['okafor', 'brooks', 'liang'],
			['kim']
		]);
	});

	it('retires a Training save once a summary read that started after it has landed, and keeps a newer save', () => {
		const base = workspace([]);
		const staleServer = expiredSummary([{ trainingTypeId: 'cpr', personnelIds: ['okafor', 'brooks'] }]);
		let overlay = put(null, base, { list: 'trainingCompletions', trainingTypeId: 'cpr', personnelIds: ['okafor'] }, 1);
		overlay = put(overlay, base, { list: 'awardTrackingAcknowledgedPersonnelIds', personnelId: 'alpha' }, 2);
		overlay = put(overlay, base, { list: 'trainingCompletions', trainingTypeId: 'cpr', personnelIds: ['brooks'] }, 3);
		const expiredIds = (current: DashboardRecordOverlay | null) =>
			overlayDashboardSummary(staleServer, base, current).trainingSummary?.expiredByType.map((e) => e.personnelIds);

		expect(expiredIds(overlay)).toEqual([]);
		const afterEarlyRead = retireTrainingCompletions(overlay, 1);
		expect(expiredIds(afterEarlyRead)).toEqual([['okafor']]);
		expect(afterEarlyRead?.changes.map((saved) => [saved.change.list, saved.saveNumber])).toEqual([
			['awardTrackingAcknowledgedPersonnelIds', 2],
			['trainingCompletions', 3]
		]);
		const afterLaterRead = retireTrainingCompletions(afterEarlyRead, 3);
		expect(expiredIds(afterLaterRead)).toEqual([['okafor', 'brooks']]);
		expect(afterLaterRead?.changes.map((saved) => saved.change.list)).toEqual([
			'awardTrackingAcknowledgedPersonnelIds'
		]);
	});
});
