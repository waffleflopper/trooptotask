import { describe, expect, it } from 'vitest';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { DashboardWorkspaceResult } from './contracts';
import { overlayDashboardRecords, putDashboardRecord } from './dashboardPageUpdates';

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
});
