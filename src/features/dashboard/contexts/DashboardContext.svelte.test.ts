import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DashboardContext, HALF_SIZE_CARDS } from './DashboardContext.svelte';
import type { CardId } from '$lib/stores/dashboardPrefs.svelte';

// ---------------------------------------------------------------------------
// Minimal stubs for stores & browser APIs
// ---------------------------------------------------------------------------

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$lib/data/changelog', () => ({ changelog: [] }));
vi.mock('$lib/stores/whatsNew.svelte', () => ({ whatsNewStore: { show: vi.fn(), close: vi.fn() } }));

// Stub all stores — each returns a minimal reactive-compatible object
vi.mock('$features/personnel/stores/personnel.svelte', () => ({
	personnelStore: { list: [] }
}));
vi.mock('$features/calendar/stores/statusTypes.svelte', () => ({
	statusTypesStore: { list: [] }
}));
vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: { list: [], load: vi.fn() }
}));
vi.mock('$features/calendar/stores/dailyAssignments.svelte', () => ({
	dailyAssignmentsStore: { assignments: [], types: [], load: vi.fn() }
}));
vi.mock('$features/training/stores/trainingTypes.svelte', () => ({
	trainingTypesStore: { list: [] }
}));
vi.mock('$lib/stores/pinnedGroups.svelte', () => ({
	pinnedGroupsStore: { list: [], load: vi.fn() }
}));
vi.mock('$lib/stores/groups.svelte', () => ({
	groupsStore: { list: [] }
}));
vi.mock('$lib/stores/dashboardPrefs.svelte', () => ({
	dashboardPrefsStore: {
		visibleCards: ['strength', 'duty', 'training', 'upcoming', 'ratings', 'onboardings', 'groups'],
		cardOrder: ['strength', 'duty', 'training', 'upcoming', 'ratings', 'onboardings', 'groups'],
		hiddenCards: []
	}
}));
vi.mock('$features/rating-scheme/utils/ratingScheme', () => ({
	getRatingDueStatus: vi.fn((_end: string, status: string) => {
		if (status === 'completed') return 'completed';
		return 'current';
	})
}));
vi.mock('$lib/utils/dashboardCards', () => ({
	getVisibleDashboardCards: vi.fn(
		() => ['strength', 'duty', 'training', 'upcoming', 'ratings', 'onboardings', 'groups'] as CardId[]
	)
}));

// ---------------------------------------------------------------------------
// Helpers to build minimal page data shapes
// ---------------------------------------------------------------------------

function makeData(overrides: Record<string, unknown> = {}) {
	return {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		permissions: {
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: true
		},
		availabilityEntries: [],
		assignmentTypes: [],
		todayAssignments: [],
		pinnedGroups: [],
		trainingSummary: null,
		onboardingTrainingCompletions: [],
		activeOnboardings: [],
		ratingSchemeEntries: [],
		onboardingTemplateStepCount: 0,
		ratingSchemeEntryCount: 0,
		orgMemberCount: 0,
		gettingStartedDismissed: false,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HALF_SIZE_CARDS constant', () => {
	it('includes the expected card IDs', () => {
		expect(HALF_SIZE_CARDS).toContain('strength');
		expect(HALF_SIZE_CARDS).toContain('duty');
		expect(HALF_SIZE_CARDS).toContain('training');
		expect(HALF_SIZE_CARDS).toContain('upcoming');
		expect(HALF_SIZE_CARDS).toContain('ratings');
	});
});

describe('DashboardContext', () => {
	let ctx: DashboardContext;

	beforeEach(() => {
		vi.restoreAllMocks();
		ctx = new DashboardContext(makeData());
	});

	// -------------------------------------------------------------------------
	// today / todayDisplay
	// -------------------------------------------------------------------------
	describe('today', () => {
		it('is a string in YYYY-MM-DD format', () => {
			expect(ctx.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});
	});

	describe('todayDisplay', () => {
		it('returns a human-readable date string', () => {
			// Should contain a month abbreviation and a year
			expect(ctx.todayDisplay).toMatch(/\d{4}/);
			expect(ctx.todayDisplay).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
		});
	});

	// -------------------------------------------------------------------------
	// Strength derived values
	// -------------------------------------------------------------------------
	describe('totalPersonnel / availableCount', () => {
		it('starts at 0 with no store data', () => {
			expect(ctx.totalPersonnel).toBe(0);
			expect(ctx.availableCount).toBe(0);
		});
	});

	describe('dutyStrengthPct', () => {
		it('returns 100 when there are no personnel', () => {
			expect(ctx.dutyStrengthPct).toBe(100);
		});
	});

	// -------------------------------------------------------------------------
	// statusBreakdown
	// -------------------------------------------------------------------------
	describe('statusBreakdown', () => {
		it('returns an empty Map when no availability entries exist', () => {
			expect(ctx.statusBreakdown.size).toBe(0);
		});
	});

	// -------------------------------------------------------------------------
	// dutyAssignments
	// -------------------------------------------------------------------------
	describe('dutyAssignments', () => {
		it('returns an empty array when no assignments exist', () => {
			expect(ctx.dutyAssignments).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------------
	// trainingStats / topTrainingIssues
	// -------------------------------------------------------------------------
	describe('trainingStats', () => {
		it('is null when trainingSummary is null', () => {
			expect(ctx.trainingStats).toBeNull();
		});

		it('uses server-provided stats when trainingSummary is present', () => {
			const stats = { current: 5, expired: 1, 'warning-orange': 2, 'warning-yellow': 0 };
			const dataWithStats = makeData({ trainingSummary: { stats, issues: [] } });
			const c = new DashboardContext(dataWithStats);
			expect(c.trainingStats).toEqual(stats);
		});
	});

	describe('topTrainingIssues', () => {
		it('returns empty array when no summary', () => {
			expect(ctx.topTrainingIssues).toHaveLength(0);
		});

		it('returns issues from trainingSummary', () => {
			const issues = [{ personName: 'SGT Smith', typeName: 'CPR', status: 'expired', label: 'Expired' }];
			const c = new DashboardContext(makeData({ trainingSummary: { stats: {}, issues } }));
			expect(c.topTrainingIssues).toHaveLength(1);
			expect(c.topTrainingIssues[0].personName).toBe('SGT Smith');
		});
	});

	// -------------------------------------------------------------------------
	// upcomingChanges / upcomingByDate
	// -------------------------------------------------------------------------
	describe('upcomingChanges', () => {
		it('returns an empty array when no availability entries', () => {
			expect(ctx.upcomingChanges).toHaveLength(0);
		});
	});

	describe('upcomingByDate', () => {
		it('returns an empty Map when no upcoming changes', () => {
			expect(ctx.upcomingByDate.size).toBe(0);
		});
	});

	// -------------------------------------------------------------------------
	// ratingStats / ratingTotal
	// -------------------------------------------------------------------------
	describe('ratingStats', () => {
		it('returns zero counts with no rating entries', () => {
			expect(ctx.ratingStats.overdue).toBe(0);
			expect(ctx.ratingStats['due-30']).toBe(0);
			expect(ctx.ratingStats['due-60']).toBe(0);
			expect(ctx.ratingStats.current).toBe(0);
		});

		it('does not count completed entries', () => {
			const entries = [{ ratingPeriodEnd: '2026-01-01', status: 'completed' }];
			const c = new DashboardContext(makeData({ ratingSchemeEntries: entries }));
			expect(c.ratingTotal).toBe(0);
		});

		it('counts non-completed entries as current (per mock)', () => {
			const entries = [
				{ ratingPeriodEnd: '2026-06-01', status: 'pending' },
				{ ratingPeriodEnd: '2026-07-01', status: 'pending' }
			];
			const c = new DashboardContext(makeData({ ratingSchemeEntries: entries }));
			expect(c.ratingTotal).toBe(2);
			expect(c.ratingStats.current).toBe(2);
		});
	});

	describe('ratingTotal', () => {
		it('sums all non-completed entries', () => {
			expect(ctx.ratingTotal).toBe(0);
		});
	});

	// -------------------------------------------------------------------------
	// activeOnboardings
	// -------------------------------------------------------------------------
	describe('activeOnboardings', () => {
		it('returns empty array when none in data', () => {
			expect(ctx.activeOnboardings).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------------
	// groupBreakdown
	// -------------------------------------------------------------------------
	describe('groupBreakdown', () => {
		it('returns an empty array when no groups', () => {
			expect(ctx.groupBreakdown).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------------
	// allowedCards / cardRows
	// -------------------------------------------------------------------------
	describe('allowedCards', () => {
		it('returns all cards when permissions object is present', () => {
			expect(ctx.allowedCards.length).toBeGreaterThan(0);
		});

		it('returns empty array when no permissions', () => {
			const c = new DashboardContext(makeData({ permissions: null }));
			expect(c.allowedCards).toHaveLength(0);
		});
	});

	describe('cardRows', () => {
		it('returns an array of arrays', () => {
			expect(Array.isArray(ctx.cardRows)).toBe(true);
			ctx.cardRows.forEach((row) => expect(Array.isArray(row)).toBe(true));
		});

		it('pairs consecutive half-size cards into a single row', () => {
			// strength and duty are both half-size — they should appear in same row
			const flatCards = ctx.cardRows.flat();
			const strengthIdx = flatCards.indexOf('strength');
			const dutyIdx = flatCards.indexOf('duty');
			expect(strengthIdx).toBeGreaterThanOrEqual(0);
			expect(dutyIdx).toBeGreaterThanOrEqual(0);

			// Find the row containing strength
			const strengthRow = ctx.cardRows.find((row) => row.includes('strength'));
			expect(strengthRow).toContain('duty');
		});
	});

	// -------------------------------------------------------------------------
	// Modal state
	// -------------------------------------------------------------------------
	describe('showCustomizeModal', () => {
		it('starts false', () => {
			expect(ctx.showCustomizeModal).toBe(false);
		});

		it('openCustomizeModal sets it true', () => {
			ctx.openCustomizeModal();
			expect(ctx.showCustomizeModal).toBe(true);
		});

		it('closeCustomizeModal sets it false', () => {
			ctx.openCustomizeModal();
			ctx.closeCustomizeModal();
			expect(ctx.showCustomizeModal).toBe(false);
		});
	});

	// -------------------------------------------------------------------------
	// Banner state
	// -------------------------------------------------------------------------
	describe('bannerDismissed', () => {
		it('starts true (to avoid flash)', () => {
			expect(ctx.bannerDismissed).toBe(true);
		});
	});

	describe('dismissBanner', () => {
		it('sets bannerDismissed to true', () => {
			ctx.dismissBanner();
			expect(ctx.bannerDismissed).toBe(true);
		});
	});

	// -------------------------------------------------------------------------
	// gettingStartedDismissed
	// -------------------------------------------------------------------------
	describe('gettingStartedDismissed', () => {
		it('reads from data prop', () => {
			const c = new DashboardContext(makeData({ gettingStartedDismissed: true }));
			expect(c.gettingStartedDismissed).toBe(true);
		});

		it('defaults to false', () => {
			expect(ctx.gettingStartedDismissed).toBe(false);
		});
	});

	// -------------------------------------------------------------------------
	// formatShortDate helper
	// -------------------------------------------------------------------------
	describe('formatShortDate', () => {
		it('formats a YYYY-MM-DD date as "Mon DD"', () => {
			const result = ctx.formatShortDate('2026-03-15');
			expect(result).toMatch(/Mar 15/);
		});
	});
});
