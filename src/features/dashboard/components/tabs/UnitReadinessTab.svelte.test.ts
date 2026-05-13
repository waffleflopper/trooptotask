// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { DashboardContext } from '../../contexts/DashboardContext.svelte';
import type { UpcomingLossRecord } from '../../utils/evaluateUpcomingLosses';
import UnitReadinessTab from './UnitReadinessTab.svelte';

function makeLoss(overrides: Partial<UpcomingLossRecord> = {}): UpcomingLossRecord {
	return {
		id: 'p1',
		personId: 'p1',
		personName: 'SGT Taylor',
		rank: 'SGT',
		lastName: 'Taylor',
		triggerType: 'ETS',
		targetDate: '2026-05-01',
		daysRemaining: 16,
		awardDueSoon: true,
		awardTrackingAcknowledged: false,
		groupId: null,
		...overrides
	};
}

function makeCtx(overrides: Record<string, unknown> = {}): DashboardContext {
	return {
		dutyStrengthPct: 90,
		availableCount: 9,
		totalPersonnel: 10,
		statusBreakdown: new Map(),
		trainingCurrencyPct: 95,
		trainingStats: {
			expired: 0,
			warningOrange: 0,
			warningYellow: 0,
			current: 10
		},
		ratingStats: {
			overdue: 0,
			'due-30': 0,
			'due-60': 0,
			current: 10
		},
		groupBreakdown: [],
		unitReadiness: {
			availabilityColor: (pct: number) => {
				if (pct >= 90) return 'var(--chart-2)';
				if (pct >= 75) return 'var(--accent)';
				return 'var(--destructive)';
			},
			availPct: 90,
			availColor: 'var(--chart-2)',
			trainingColor: 'var(--chart-2)',
			statusEntries: [],
			upcomingChanges: {
				mode: 'date',
				setMode: () => {},
				byGroup: [['Alpha', []]]
			}
		},
		upcomingChanges: [
			{
				key: 'change-1',
				personName: 'SGT Smith',
				date: '2026-04-20',
				direction: 'departing',
				statusName: 'Leave',
				groupName: 'Alpha'
			}
		],
		upcomingLosses: [makeLoss()],
		formatShortDate: (date: string) => `Fmt ${date}`,
		...overrides
	} as unknown as DashboardContext;
}

afterEach(() => {
	cleanup();
});

describe('UnitReadinessTab', () => {
	it('renders upcoming losses beside upcoming changes in the forward-looking row', () => {
		const { container } = render(UnitReadinessTab, {
			props: { ctx: makeCtx() }
		});

		const forwardRow = container.querySelector('.forward-looking-grid');
		expect(forwardRow).toBeTruthy();

		const upcomingChangesHeading = screen.getByText('Upcoming Changes');
		const upcomingLossesHeading = screen.getByText('Upcoming Losses');
		expect(forwardRow?.contains(upcomingChangesHeading)).toBe(true);
		expect(forwardRow?.contains(upcomingLossesHeading)).toBe(true);
		expect(upcomingChangesHeading.compareDocumentPosition(upcomingLossesHeading)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING
		);

		expect(screen.getByText('SGT Smith')).toBeTruthy();
		expect(screen.getByText('Taylor')).toBeTruthy();
		expect(screen.getAllByText('Fmt 2026-05-01')).toHaveLength(1);
	});
});
