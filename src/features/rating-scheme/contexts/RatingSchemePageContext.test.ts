import { describe, expect, it } from 'vitest';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import { createOrgContext, type CreateOrgContextInput, type OrgContext } from '$lib/stores/orgContext.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { RatingSchemePageContext, type RatingSchemePageData } from './RatingSchemePageContext.svelte';

const entries: RatingSchemeEntry[] = [
	{
		id: 'overdue',
		ratedPersonId: 'p1',
		evalType: 'NCOER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2025-01-01',
		ratingPeriodEnd: '2025-12-31',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'drafting'
	},
	{
		id: 'due-30',
		ratedPersonId: 'p2',
		evalType: 'OER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2026-04-01',
		ratingPeriodEnd: '2026-05-15',
		status: 'active',
		notes: null,
		reportType: 'AN',
		workflowStatus: 'with-rater'
	},
	{
		id: 'completed',
		ratedPersonId: 'p3',
		evalType: 'WOER',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2026-01-01',
		ratingPeriodEnd: '2026-06-20',
		status: 'completed',
		notes: null,
		reportType: 'AN',
		workflowStatus: null
	}
];

function makeOrg(overrides: Partial<CreateOrgContextInput> = {}): OrgContext {
	return createOrgContext({
		orgId: 'org-1',
		orgName: 'Test Org',
		userId: 'user-1',
		userRole: 'member',
		capabilityMap: {
			calendar: 'view',
			personnel: 'view',
			training: 'view',
			criticalTasks: 'view',
			onboarding: 'view',
			ratingScheme: 'view'
		},
		scopeSet: { kind: 'organization' },
		permissions: {} as OrgContext['permissions'],
		scopedGroupId: null,
		isReadOnly: false,
		...overrides
	});
}

function makeData(overrides: Partial<RatingSchemePageData> = {}): RatingSchemePageData {
	return {
		orgId: 'org-1',
		orgName: 'Test Org',
		permissions: {
			canViewCalendar: false,
			canEditCalendar: false,
			canViewPersonnel: false,
			canEditPersonnel: false,
			canViewTraining: false,
			canEditTraining: false,
			canViewCriticalTasks: false,
			canEditCriticalTasks: false,
			canViewOnboarding: false,
			canEditOnboarding: false,
			canViewRatingScheme: true,
			canEditRatingScheme: true,
			canViewLeadersBook: false,
			canEditLeadersBook: false,
			canManageMembers: false
		},
		ratingSchemeEntries: entries,
		...overrides
	};
}

describe('RatingSchemePageContext', () => {
	it('counts only overdue, 60-day, and 30-day stats for the page summary', () => {
		const ctx = new RatingSchemePageContext(makeData(), new ModalRegistry(), makeOrg(), entries);

		expect(ctx.ratingStats).toEqual({ overdue: 1, 'due-30': 1, 'due-60': 0 });
	});

	it('filters rating entries by status, eval type, and workflow through the page context', () => {
		const ctx = new RatingSchemePageContext(makeData(), new ModalRegistry(), makeOrg(), entries);

		ctx.ratingFilter = 'active';
		ctx.evalTypeFilter = 'OER';
		ctx.workflowFilter = 'with-rater';

		expect(ctx.filteredRatingEntries.map((entry) => entry.id)).toEqual(['due-30']);
	});

	it('opens rating modal payloads for add and edit flows', () => {
		const modals = new ModalRegistry();
		const ctx = new RatingSchemePageContext(makeData(), modals, makeOrg(), entries);

		ctx.handleAddRatingEntry();
		expect(modals.payload<{ entry: RatingSchemeEntry | null }>('rating-modal')?.entry).toBeNull();

		ctx.handleEditRatingEntry(entries[0]);
		expect(modals.payload<{ entry: RatingSchemeEntry }>('rating-modal')?.entry).toBe(entries[0]);
	});

	it('uses Rating Scheme advisory policy decisions instead of legacy Personnel or Leaders Book permissions', () => {
		const ctx = new RatingSchemePageContext(
			makeData({
				permissions: {
					...makeData().permissions!,
					canViewPersonnel: true,
					canEditPersonnel: true,
					canViewRatingScheme: false,
					canEditRatingScheme: false,
					canEditLeadersBook: true
				}
			}),
			new ModalRegistry(),
			makeOrg({
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'operate'
				}
			}),
			entries
		);

		expect(ctx.canViewRatingScheme).toBe(true);
		expect(ctx.showRatingSchemeWriteActions).toBe(true);
		expect(ctx.canUseRatingSchemeWriteActions).toBe(true);
	});

	it('keeps Rating Scheme write affordances visible but disabled in read-only mode', () => {
		const ctx = new RatingSchemePageContext(
			makeData(),
			new ModalRegistry(),
			makeOrg({
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'operate'
				},
				isReadOnly: true
			}),
			entries
		);

		expect(ctx.showRatingSchemeWriteActions).toBe(true);
		expect(ctx.canUseRatingSchemeWriteActions).toBe(false);
		expect(ctx.ratingSchemeWriteAffordance.disabled).toBe(true);
	});

	it('does not expose Rating Scheme access through adjacent Personnel capability', () => {
		const ctx = new RatingSchemePageContext(
			makeData(),
			new ModalRegistry(),
			makeOrg({
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}),
			entries
		);

		expect(ctx.canViewRatingScheme).toBe(false);
		expect(ctx.showRatingSchemeWriteActions).toBe(false);
	});
});
