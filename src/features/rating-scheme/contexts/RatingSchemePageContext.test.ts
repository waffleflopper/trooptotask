import type { PersonnelLookup } from '$features/personnel/contracts';
import { createClientAccess, type ClientAccessFacts } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
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

function makeOrg(overrides: Partial<ClientAccessFacts> = {}) {
	return createClientAccess({ membershipRole: 'member', capabilityMap: createCapabilityMap('view'), ...overrides });
}

const personnel: PersonnelLookup[] = [
	{ id: 'p1', rank: 'SGT', firstName: 'Riley', lastName: 'Adams' },
	{ id: 'p2', rank: 'CPT', firstName: 'Alex', lastName: 'Baker' },
	{ id: 'p3', rank: 'CW2', firstName: 'Sam', lastName: 'Clark' },
	{ id: 'rater-1', rank: 'MAJ', firstName: 'Robin', lastName: 'Daniels' },
	{ id: 'intermediate-1', rank: 'LTC', firstName: 'Morgan', lastName: 'Evans' },
	{ id: 'reviewer-1', rank: 'COL', firstName: 'Jordan', lastName: 'Flores' }
];

function makeData(overrides: Partial<RatingSchemePageData> = {}): RatingSchemePageData {
	return {
		orgId: 'test-org',
		orgName: 'Test Org',
		ratingSchemeEntries: entries,
		personnelLookup: personnel,
		...overrides
	};
}

describe('RatingSchemePageContext', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('counts only overdue, 60-day, and 30-day stats for the page summary', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-14T12:00:00Z'));
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

	it.each([
		['  ADAMS  ', 'overdue'],
		['sgt riley adams', 'overdue'],
		['adams, riley', 'overdue'],
		['mAj RoBiN DaNiElS', 'overdue'],
		['daniels, robin', 'overdue'],
		['external senior', 'due-30'],
		['ltc morgan evans', 'overdue'],
		['flores, jordan', 'overdue'],
		['outside ir', 'due-30'],
		['outside reviewer', 'due-30']
	])('searches rated Soldiers and all chain roles using %j', (query, expectedId) => {
		const searchableEntries = [
			{
				...entries[0],
				raterPersonId: 'rater-1',
				raterName: 'ignored name',
				intermediateRaterPersonId: 'intermediate-1',
				reviewerPersonId: 'reviewer-1'
			},
			{
				...entries[1],
				seniorRaterName: 'COL External Senior',
				intermediateRaterName: 'Outside IR',
				reviewerName: 'Outside Reviewer'
			},
			entries[2]
		];
		const ctx = new RatingSchemePageContext(makeData(), new ModalRegistry(), makeOrg(), searchableEntries);
		ctx.searchQuery = query;
		expect(ctx.filteredRatingEntries.map((entry) => entry.id)).toEqual([expectedId]);
	});

	it('combines search with every filter and clears all four back to their defaults', () => {
		const ctx = new RatingSchemePageContext(makeData(), new ModalRegistry(), makeOrg(), entries);
		expect(ctx.groupedSort).toBe('urgency');
		expect(ctx.hasActiveSearchOrFilters).toBe(false);
		ctx.searchQuery = '   ';
		expect(ctx.hasActiveSearchOrFilters).toBe(false);
		expect(ctx.filteredRatingEntries.map((entry) => entry.id)).toEqual(['overdue', 'due-30']);
		ctx.searchQuery = 'baker';
		ctx.evalTypeFilter = 'OER';
		ctx.workflowFilter = 'with-rater';
		expect(ctx.hasActiveSearchOrFilters).toBe(true);
		expect(ctx.filteredRatingEntries.map((entry) => entry.id)).toEqual(['due-30']);
		ctx.workflowFilter = 'drafting';
		expect(ctx.filteredRatingEntries).toEqual([]);
		ctx.workflowFilter = 'with-rater';
		ctx.evalTypeFilter = 'NCOER';
		expect(ctx.filteredRatingEntries).toEqual([]);
		ctx.evalTypeFilter = 'OER';
		ctx.ratingFilter = 'completed';
		expect(ctx.filteredRatingEntries).toEqual([]);
		ctx.clearSearchAndFilters();
		expect(ctx.searchQuery).toBe('');
		expect(ctx.ratingFilter).toBe('active');
		expect(ctx.evalTypeFilter).toBe('all');
		expect(ctx.workflowFilter).toBe('all');
		expect(ctx.hasActiveSearchOrFilters).toBe(false);
		expect(ctx.filteredRatingEntries.map((entry) => entry.id)).toEqual(['overdue', 'due-30']);
	});

	it.each(['status', 'evalType', 'workflow'] as const)(
		'recognizes a non-default %s filter without a search',
		(filter) => {
			const ctx = new RatingSchemePageContext(makeData(), new ModalRegistry(), makeOrg(), entries);
			if (filter === 'status') ctx.ratingFilter = 'all';
			if (filter === 'evalType') ctx.evalTypeFilter = 'WOER';
			if (filter === 'workflow') ctx.workflowFilter = 'drafting';
			expect(ctx.hasActiveSearchOrFilters).toBe(true);
			ctx.clearSearchAndFilters();
			expect(ctx.hasActiveSearchOrFilters).toBe(false);
		}
	);

	it('opens rating modal payloads for add and edit flows', () => {
		const modals = new ModalRegistry();
		const ctx = new RatingSchemePageContext(makeData(), modals, makeOrg(), entries);

		ctx.handleAddRatingEntry();
		expect(modals.payload<{ entry: RatingSchemeEntry | null }>('rating-modal')?.entry).toBeNull();

		ctx.handleEditRatingEntry(entries[0]);
		expect(modals.payload<{ entry: RatingSchemeEntry }>('rating-modal')?.entry).toBe(entries[0]);
	});

	it('uses Rating Scheme advisory policy decisions for page affordances', () => {
		const ctx = new RatingSchemePageContext(
			makeData(),
			new ModalRegistry(),
			makeOrg({
				capabilityMap: { ...createCapabilityMap('none'), ratingScheme: 'operate' }
			}),
			entries
		);

		expect(ctx.canViewRatingScheme).toBe(true);
		expect(ctx.showRatingSchemeWriteActions).toBe(true);
		expect(ctx.canUseRatingSchemeWriteActions).toBe(true);
	});

	it('does not expose Rating Scheme access through adjacent Personnel capability', () => {
		const ctx = new RatingSchemePageContext(
			makeData(),
			new ModalRegistry(),
			makeOrg({
				capabilityMap: { ...createCapabilityMap('none'), personnel: 'configure' }
			}),
			entries
		);

		expect(ctx.canViewRatingScheme).toBe(false);
		expect(ctx.showRatingSchemeWriteActions).toBe(false);
	});
});
