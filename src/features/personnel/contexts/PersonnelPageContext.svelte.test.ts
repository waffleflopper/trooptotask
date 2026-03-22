import { describe, it, expect } from 'vitest';
import { PersonnelPageContext } from './PersonnelPageContext.svelte';
import type { Personnel } from '$lib/types';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function makePerson(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'p1',
		firstName: 'John',
		lastName: 'Smith',
		rank: 'SGT',
		mos: '11B',
		clinicRole: 'Medic',
		groupId: null,
		groupName: '',
		archivedAt: null,
		...overrides
	};
}

function makeRatingEntry(overrides: Partial<RatingSchemeEntry> = {}): RatingSchemeEntry {
	return {
		id: 'r1',
		ratedPersonId: 'p1',
		raterPersonId: null,
		raterName: null,
		seniorRaterPersonId: null,
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		evalType: 'NCOER',
		status: 'active',
		ratingPeriodStart: '2025-01-01',
		ratingPeriodEnd: '2025-12-31',
		reportType: null,
		workflowStatus: null,
		notes: null,
		...overrides
	};
}

function makeData(overrides: Record<string, unknown> = {}) {
	return {
		orgId: 'org1',
		orgName: 'Test Org',
		pinnedGroups: [] as string[],
		ratingSchemeEntries: [] as RatingSchemeEntry[],
		personnel: [] as Personnel[],
		permissions: {
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewCalendar: true,
			canEditCalendar: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: true
		},
		scopedGroupId: null as string | null,
		isOwner: false,
		isAdmin: false,
		isFullEditor: false,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PersonnelPageContext', () => {
	describe('initial state', () => {
		it('initialises with default view state', () => {
			const ctx = new PersonnelPageContext(makeData());
			expect(ctx.viewMode).toBe('by-group');
			expect(ctx.pageView).toBe('roster');
			expect(ctx.searchQuery).toBe('');
			expect(ctx.ratingViewMode).toBe('grouped');
			expect(ctx.ratingFilter).toBe('active');
			expect(ctx.evalTypeFilter).toBe('all');
		});

		it('initialises modal visibility flags as false', () => {
			const ctx = new PersonnelPageContext(makeData());
			expect(ctx.showPersonnelModal).toBe(false);
			expect(ctx.showGroupManager).toBe(false);
			expect(ctx.showBulkManager).toBe(false);
			expect(ctx.showRatingModal).toBe(false);
		});

		it('initialises editing state as null', () => {
			const ctx = new PersonnelPageContext(makeData());
			expect(ctx.editingPerson).toBeNull();
			expect(ctx.editingEntry).toBeNull();
		});
	});

	describe('permission flags', () => {
		it('canAddPersonnel is true when canEditPersonnel and no scopedGroupId', () => {
			const ctx = new PersonnelPageContext(makeData({ permissions: { canEditPersonnel: true }, scopedGroupId: null }));
			expect(ctx.canAddPersonnel).toBe(true);
		});

		it('canAddPersonnel is false when scopedGroupId is set', () => {
			const ctx = new PersonnelPageContext(makeData({ permissions: { canEditPersonnel: true }, scopedGroupId: 'g1' }));
			expect(ctx.canAddPersonnel).toBe(false);
		});

		it('canAddPersonnel is false when canEditPersonnel is false', () => {
			const ctx = new PersonnelPageContext(makeData({ permissions: { canEditPersonnel: false }, scopedGroupId: null }));
			expect(ctx.canAddPersonnel).toBe(false);
		});
	});

	describe('filtered personnel (search)', () => {
		it('returns all personnel when searchQuery is empty', () => {
			const people = [makePerson({ id: 'p1', lastName: 'Smith' }), makePerson({ id: 'p2', lastName: 'Jones' })];
			const ctx = new PersonnelPageContext(makeData(), people);
			expect(ctx.filteredPersonnel).toHaveLength(2);
		});

		it('filters by lastName (case-insensitive)', () => {
			const people = [makePerson({ id: 'p1', lastName: 'Smith' }), makePerson({ id: 'p2', lastName: 'Jones' })];
			const ctx = new PersonnelPageContext(makeData(), people);
			ctx.searchQuery = 'smith';
			expect(ctx.filteredPersonnel).toHaveLength(1);
			expect(ctx.filteredPersonnel[0].id).toBe('p1');
		});

		it('filters by firstName', () => {
			const people = [
				makePerson({ id: 'p1', firstName: 'Alice', lastName: 'Smith' }),
				makePerson({ id: 'p2', firstName: 'Bob', lastName: 'Smith' })
			];
			const ctx = new PersonnelPageContext(makeData(), people);
			ctx.searchQuery = 'alice';
			expect(ctx.filteredPersonnel).toHaveLength(1);
			expect(ctx.filteredPersonnel[0].id).toBe('p1');
		});

		it('filters by rank', () => {
			const people = [makePerson({ id: 'p1', rank: 'CPT' }), makePerson({ id: 'p2', rank: 'SGT' })];
			const ctx = new PersonnelPageContext(makeData(), people);
			ctx.searchQuery = 'CPT';
			expect(ctx.filteredPersonnel).toHaveLength(1);
			expect(ctx.filteredPersonnel[0].id).toBe('p1');
		});

		it('filters by clinicRole', () => {
			const people = [makePerson({ id: 'p1', clinicRole: 'Medic' }), makePerson({ id: 'p2', clinicRole: 'Admin' })];
			const ctx = new PersonnelPageContext(makeData(), people);
			ctx.searchQuery = 'medic';
			expect(ctx.filteredPersonnel).toHaveLength(1);
			expect(ctx.filteredPersonnel[0].id).toBe('p1');
		});

		it('returns empty array when no matches', () => {
			const people = [makePerson({ lastName: 'Smith' })];
			const ctx = new PersonnelPageContext(makeData(), people);
			ctx.searchQuery = 'zzz';
			expect(ctx.filteredPersonnel).toHaveLength(0);
		});

		it('ignores leading/trailing whitespace in search query', () => {
			const people = [makePerson({ id: 'p1', lastName: 'Smith' }), makePerson({ id: 'p2', lastName: 'Jones' })];
			const ctx = new PersonnelPageContext(makeData(), people);
			ctx.searchQuery = '  smith  ';
			expect(ctx.filteredPersonnel).toHaveLength(1);
		});
	});

	describe('alphabeticalPersonnel', () => {
		it('sorts by lastName then firstName', () => {
			const people = [
				makePerson({ id: 'p1', lastName: 'Smith', firstName: 'Bob' }),
				makePerson({ id: 'p2', lastName: 'Adams', firstName: 'Zoe' }),
				makePerson({ id: 'p3', lastName: 'Smith', firstName: 'Alice' })
			];
			const ctx = new PersonnelPageContext(makeData(), people);
			const sorted = ctx.alphabeticalPersonnel;
			expect(sorted[0].id).toBe('p2'); // Adams
			expect(sorted[1].id).toBe('p3'); // Smith, Alice
			expect(sorted[2].id).toBe('p1'); // Smith, Bob
		});
	});

	describe('totalPersonnel and filteredCount', () => {
		it('totalPersonnel reflects all personnel passed in', () => {
			const people = [makePerson({ id: 'p1' }), makePerson({ id: 'p2' }), makePerson({ id: 'p3' })];
			const ctx = new PersonnelPageContext(makeData(), people);
			expect(ctx.totalPersonnel).toBe(3);
		});

		it('filteredCount in alphabetical mode equals alphabeticalPersonnel length after search', () => {
			const people = [makePerson({ id: 'p1', lastName: 'Smith' }), makePerson({ id: 'p2', lastName: 'Jones' })];
			const ctx = new PersonnelPageContext(makeData(), people);
			ctx.viewMode = 'alphabetical';
			ctx.searchQuery = 'smith';
			expect(ctx.filteredCount).toBe(1);
		});
	});

	describe('rating scheme filtering', () => {
		it('hasAnyWorkflowStatus is false when no entries have workflowStatus', () => {
			const ctx = new PersonnelPageContext(makeData(), [], [makeRatingEntry({ workflowStatus: null })]);
			expect(ctx.hasAnyWorkflowStatus).toBe(false);
		});

		it('hasAnyWorkflowStatus is true when any entry has workflowStatus', () => {
			const ctx = new PersonnelPageContext(makeData(), [], [makeRatingEntry({ workflowStatus: 'drafting' })]);
			expect(ctx.hasAnyWorkflowStatus).toBe(true);
		});

		it('filteredRatingEntries filters by ratingFilter (active by default)', () => {
			const entries = [
				makeRatingEntry({ id: 'r1', status: 'active' }),
				makeRatingEntry({ id: 'r2', status: 'completed' }),
				makeRatingEntry({ id: 'r3', status: 'change-of-rater' })
			];
			const ctx = new PersonnelPageContext(makeData(), [], entries);
			// default is 'active'
			expect(ctx.filteredRatingEntries).toHaveLength(1);
			expect(ctx.filteredRatingEntries[0].id).toBe('r1');
		});

		it('filteredRatingEntries returns all when ratingFilter is all', () => {
			const entries = [
				makeRatingEntry({ id: 'r1', status: 'active' }),
				makeRatingEntry({ id: 'r2', status: 'completed' })
			];
			const ctx = new PersonnelPageContext(makeData(), [], entries);
			ctx.ratingFilter = 'all';
			expect(ctx.filteredRatingEntries).toHaveLength(2);
		});

		it('filteredRatingEntries filters by evalTypeFilter', () => {
			const entries = [
				makeRatingEntry({ id: 'r1', evalType: 'OER', status: 'active' }),
				makeRatingEntry({ id: 'r2', evalType: 'NCOER', status: 'active' })
			];
			const ctx = new PersonnelPageContext(makeData(), [], entries);
			ctx.evalTypeFilter = 'OER';
			expect(ctx.filteredRatingEntries).toHaveLength(1);
			expect(ctx.filteredRatingEntries[0].id).toBe('r1');
		});

		it('filteredRatingEntries filters by workflowFilter', () => {
			const entries = [
				makeRatingEntry({ id: 'r1', status: 'active', workflowStatus: 'drafting' }),
				makeRatingEntry({ id: 'r2', status: 'active', workflowStatus: 'completed' })
			];
			const ctx = new PersonnelPageContext(makeData(), [], entries);
			ctx.workflowFilter = 'drafting';
			expect(ctx.filteredRatingEntries).toHaveLength(1);
			expect(ctx.filteredRatingEntries[0].id).toBe('r1');
		});
	});

	describe('modal handlers', () => {
		it('handleAdd opens personnel modal with no editing person', () => {
			const ctx = new PersonnelPageContext(makeData());
			ctx.handleAdd();
			expect(ctx.showPersonnelModal).toBe(true);
			expect(ctx.editingPerson).toBeNull();
		});

		it('handleEdit opens personnel modal with the person', () => {
			const person = makePerson();
			const ctx = new PersonnelPageContext(makeData(), [person]);
			ctx.handleEdit(person);
			expect(ctx.showPersonnelModal).toBe(true);
			expect(ctx.editingPerson).toBe(person);
		});

		it('closePersonnelModal hides modal and clears editingPerson', () => {
			const person = makePerson();
			const ctx = new PersonnelPageContext(makeData(), [person]);
			ctx.handleEdit(person);
			ctx.closePersonnelModal();
			expect(ctx.showPersonnelModal).toBe(false);
			expect(ctx.editingPerson).toBeNull();
		});

		it('handleAddRatingEntry opens rating modal with no editing entry', () => {
			const ctx = new PersonnelPageContext(makeData());
			ctx.handleAddRatingEntry();
			expect(ctx.showRatingModal).toBe(true);
			expect(ctx.editingEntry).toBeNull();
		});

		it('handleEditRatingEntry opens rating modal with the entry', () => {
			const entry = makeRatingEntry();
			const ctx = new PersonnelPageContext(makeData(), [], [entry]);
			ctx.handleEditRatingEntry(entry);
			expect(ctx.showRatingModal).toBe(true);
			expect(ctx.editingEntry).toBe(entry);
		});
	});

	describe('toggleGroup', () => {
		it('collapses an expanded group', () => {
			const ctx = new PersonnelPageContext(makeData());
			expect(ctx.collapsedGroups.has('Alpha')).toBe(false);
			ctx.toggleGroup('Alpha');
			expect(ctx.collapsedGroups.has('Alpha')).toBe(true);
		});

		it('expands a collapsed group', () => {
			const ctx = new PersonnelPageContext(makeData());
			ctx.toggleGroup('Alpha');
			ctx.toggleGroup('Alpha');
			expect(ctx.collapsedGroups.has('Alpha')).toBe(false);
		});
	});
});
