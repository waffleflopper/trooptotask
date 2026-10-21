import { describe, expect, it } from 'vitest';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import type { DashboardPageSummaryData, DashboardWorkspaceResult } from './contracts';
import {
	overlayDashboardRecords,
	overlayDashboardSummary,
	putDashboardRecord,
	putDashboardSummaryChange
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

function summary(expiredByType: Array<{ trainingTypeId: string; personnelIds: string[] }>): DashboardPageSummaryData {
	return {
		trainingSummary: {
			stats: { total: 4 },
			issues: [],
			expiredByType: expiredByType.map((expired) => ({ ...expired, maxDaysLate: 12 })),
			expiredPersonnelCount: 3,
			groupDelinquencies: []
		},
		ictlSummary: null,
		onboardingTrainingCompletions: []
	} as unknown as DashboardPageSummaryData;
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

	it('replaces a saved evaluation and adds an acknowledged award once', () => {
		const base = workspace([], {
			ratingSchemeEntries: [entry('active')],
			awardTrackingAcknowledgedPersonnelIds: ['bravo']
		});
		let overlay = putDashboardRecord(null, base, { list: 'ratingSchemeEntries', record: entry('completed') });
		overlay = putDashboardRecord(overlay, base, {
			list: 'awardTrackingAcknowledgedPersonnelIds',
			personnelId: 'alpha'
		});
		overlay = putDashboardRecord(overlay, base, {
			list: 'awardTrackingAcknowledgedPersonnelIds',
			personnelId: 'alpha'
		});

		const data = overlayDashboardRecords(base, overlay).data;
		expect(data.ratingSchemeEntries).toEqual([entry('completed')]);
		expect(data.awardTrackingAcknowledgedPersonnelIds).toEqual(['bravo', 'alpha']);
	});
});

describe('the Dashboard summary overlay', () => {
	it('takes recorded People off their type and drops a type once nobody is left', () => {
		const base = summary([
			{ trainingTypeId: 'cpr', personnelIds: ['okafor', 'brooks', 'liang'] },
			{ trainingTypeId: 'sharp', personnelIds: ['kim'] }
		]);
		let overlay = putDashboardSummaryChange(null, base, { trainingTypeId: 'cpr', recordedPersonnelIds: ['okafor'] });
		overlay = putDashboardSummaryChange(overlay, base, { trainingTypeId: 'sharp', recordedPersonnelIds: ['kim'] });

		expect(overlayDashboardSummary(base, overlay).trainingSummary?.expiredByType).toEqual([
			{ trainingTypeId: 'cpr', personnelIds: ['brooks', 'liang'], maxDaysLate: 12 }
		]);
		expect(base.trainingSummary?.expiredByType.map((expired) => expired.personnelIds)).toEqual([
			['okafor', 'brooks', 'liang'],
			['kim']
		]);
	});

	it('drops once the refreshed summary arrives', () => {
		const base = summary([{ trainingTypeId: 'cpr', personnelIds: ['okafor'] }]);
		const overlay = putDashboardSummaryChange(null, base, { trainingTypeId: 'cpr', recordedPersonnelIds: ['okafor'] });
		const refreshed = summary([{ trainingTypeId: 'cpr', personnelIds: ['brooks'] }]);

		expect(overlayDashboardSummary(refreshed, overlay)).toBe(refreshed);
	});
});
