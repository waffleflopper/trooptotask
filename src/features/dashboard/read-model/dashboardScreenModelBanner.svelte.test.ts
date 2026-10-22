import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDashboardScreenModel, type DashboardScreenModel } from './dashboardScreenModel.svelte';
import { rosterStore } from '$features/personnel';
import {
	calendarStatusSource as statusTypesStore,
	calendarAvailabilitySource as availabilityStore,
	calendarAssignmentsSource as dailyAssignmentsStore
} from '$features/calendar';
import { groupsStore } from '$features/personnel';
import type { DashboardWorkspaceResult } from '../contracts';
import type { DashboardPageData } from '../contracts';

const mutableRosterStore = rosterStore as unknown as { items: Array<Record<string, unknown>> };
const mutableStatusTypesStore = statusTypesStore as unknown as { items: Array<Record<string, unknown>> };
const mutableAvailabilityStore = availabilityStore as unknown as {
	items: Array<Record<string, unknown>>;
	loading: boolean;
};
const mutableDailyAssignmentsStore = dailyAssignmentsStore as unknown as { loading: boolean };
const mutableGroupsStore = groupsStore as unknown as { loading: boolean };

vi.mock('$app/environment', () => ({ browser: false }));

vi.mock('$features/personnel', () => ({
	rosterStore: { items: [] },
	groupsStore: { items: [], loading: false },
	pinnedGroupsStore: { list: [], load: vi.fn() }
}));
vi.mock('$features/calendar', () => ({
	calendarStatusSource: { items: [] },
	calendarAvailabilitySource: { items: [], loading: false },
	calendarAssignmentsSource: { assignments: [], types: [], loading: false }
}));
vi.mock('$features/training', () => ({
	trainingTypesStore: { items: [] }
}));

function makeWorkspaceData(overrides: Record<string, unknown> = {}) {
	return {
		availabilityEntries: [],
		assignmentTypes: [],
		todayAssignments: [],
		range: { rangeStart: '2026-04-30', rangeEnd: '2026-05-15' },
		pinnedGroups: [],
		activeOnboardings: [],
		ratingSchemeEntries: [],
		personnel: [],
		groups: [],
		statusTypes: [],
		trainingTypes: [],
		lossWarningWindowDays: 180,
		strengthFloorPercent: 80,
		awardTrackingAcknowledgedPersonnelIds: [],
		specialDays: [],
		...overrides
	};
}

function makeData(
	overrides: Partial<DashboardPageData> = {},
	workspaceOverrides: Record<string, unknown> = {}
): DashboardPageData {
	return {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		viewerDay: { date: '2026-04-23', timeZone: 'UTC' },
		disabledFeatures: [],
		dashboard: {
			workspaceKey: 'dashboard',
			data: makeWorkspaceData(workspaceOverrides),
			hydration: { orgId: 'org-1' } as DashboardWorkspaceResult['hydration']
		},
		trainingSummary: null,
		ictlSummary: null,
		summaryFailed: false,
		onboardingTrainingCompletions: [],
		onboardingTemplateStepCount: 0,
		ratingSchemeEntryCount: 0,
		orgMemberCount: 0,
		gettingStartedDismissed: false,
		...overrides
	};
}

describe('DashboardScreenModel (migrated context coverage)', () => {
	let ctx: DashboardScreenModel;

	beforeEach(() => {
		vi.restoreAllMocks();
		mutableRosterStore.items = [];
		mutableStatusTypesStore.items = [];
		mutableAvailabilityStore.items = [];
		mutableDailyAssignmentsStore.loading = false;
		mutableGroupsStore.loading = false;
		ctx = createDashboardScreenModel(makeData());
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('today', () => {
		it("is the page load's viewer day even when the browser clock reads another day", () => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date('2026-10-20T03:00:00Z'));
			const model = createDashboardScreenModel(
				makeData({ viewerDay: { date: '2026-10-19', timeZone: 'America/Los_Angeles' } })
			);

			expect(model.today).toBe('2026-10-19');
		});
	});

	describe('strength', () => {
		it('reads everyone available at 100 percent with no store data', () => {
			const { bottomLine } = ctx.strength;
			expect([ctx.totalPersonnel, bottomLine.available, bottomLine.assigned, bottomLine.percent]).toEqual([
				0, 0, 0, 100
			]);
		});

		it('reflects streamed store data and ignores availability outside the loaded personnel scope', () => {
			mutableRosterStore.items = [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'Jane' }];
			mutableStatusTypesStore.items = [
				{ id: 'st1', name: 'Leave', color: '#111111', textColor: '#ffffff', sortOrder: 0 }
			];
			mutableAvailabilityStore.items = [
				{
					id: 'a1',
					personnelId: 'p1',
					statusTypeId: 'st1',
					startDate: ctx.today,
					endDate: ctx.today
				},
				{
					id: 'a2',
					personnelId: 'outside-scope',
					statusTypeId: 'st1',
					startDate: ctx.today,
					endDate: ctx.today
				}
			];

			const { bottomLine } = ctx.strength;
			expect([bottomLine.available, bottomLine.assigned]).toEqual([0, 1]);
			expect(bottomLine.outPeople.map(({ personnelId, statusTypeId }) => [personnelId, statusTypeId])).toEqual([
				['p1', 'st1']
			]);
		});
	});

	describe('isHydrating', () => {
		it('is false once the composite stores are loaded', () => {
			expect(ctx.isHydrating).toBe(false);
		});

		it('is true while any composite store is still loading', () => {
			mutableAvailabilityStore.loading = true;
			expect(createDashboardScreenModel(makeData()).isHydrating).toBe(true);
		});
	});

	describe('gettingStartedDismissed', () => {
		it('reads from data prop', () => {
			const c = createDashboardScreenModel(makeData({ gettingStartedDismissed: true }));
			expect(c.gettingStartedDismissed).toBe(true);
		});

		it('defaults to false', () => {
			expect(ctx.gettingStartedDismissed).toBe(false);
		});
	});

	describe('support data', () => {
		it('starts without support data when checklist metadata is omitted', () => {
			const c = createDashboardScreenModel(
				makeData({
					onboardingTemplateStepCount: undefined,
					ratingSchemeEntryCount: undefined,
					orgMemberCount: undefined,
					gettingStartedDismissed: undefined
				})
			);

			expect(c.hasSupportData).toBe(false);
			expect(c.onboardingTemplateStepCount).toBe(0);
			expect(c.ratingSchemeEntryCount).toBe(0);
			expect(c.orgMemberCount).toBe(0);
			expect(c.gettingStartedDismissed).toBe(false);
		});

		it('applies deferred checklist metadata without rebuilding the model', () => {
			ctx.applySupportData({
				onboardingTemplateStepCount: 4,
				ratingSchemeEntryCount: 3,
				orgMemberCount: 2,
				gettingStartedDismissed: true
			});

			expect(ctx.hasSupportData).toBe(true);
			expect(ctx.onboardingTemplateStepCount).toBe(4);
			expect(ctx.ratingSchemeEntryCount).toBe(3);
			expect(ctx.orgMemberCount).toBe(2);
			expect(ctx.gettingStartedDismissed).toBe(true);
		});
	});
});
