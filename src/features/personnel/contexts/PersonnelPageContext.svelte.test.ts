import { describe, it, expect } from 'vitest';
import { PersonnelPageContext } from './PersonnelPageContext.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
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
		...overrides
	};
}

function makeModals(): ModalRegistry {
	return new ModalRegistry();
}

function makeOrg(overrides: Partial<OrgContext> = {}): OrgContext {
	return {
		orgId: 'org1',
		orgName: 'Test Org',
		userId: 'u1',
		role: 'member',
		isOwner: false,
		isAdmin: false,
		isPrivileged: false,
		isFullEditor: false,
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
		scopedGroupId: null,
		readOnly: false,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PersonnelPageContext', () => {
	describe('initial state', () => {
		it('initialises with default view state', () => {
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg());
			expect(ctx.viewMode).toBe('by-group');
			expect(ctx.pageView).toBe('roster');
			expect(ctx.searchQuery).toBe('');
			expect(ctx.ratingViewMode).toBe('grouped');
			expect(ctx.ratingFilter).toBe('active');
			expect(ctx.evalTypeFilter).toBe('all');
		});

		it('initialises with no modals open', () => {
			const modals = makeModals();
			new PersonnelPageContext(makeData(), modals, makeOrg());
			expect(modals.isOpen('personnel-modal')).toBe(false);
			expect(modals.isOpen('group-manager')).toBe(false);
			expect(modals.isOpen('bulk-manager')).toBe(false);
			expect(modals.isOpen('rating-modal')).toBe(false);
		});
	});

	describe('permission flags', () => {
		it('canAddPersonnel is true when canEditPersonnel and no scopedGroupId', () => {
			const ctx = new PersonnelPageContext(
				makeData({ permissions: { canEditPersonnel: true }, scopedGroupId: null }),
				makeModals(),
				makeOrg()
			);
			expect(ctx.canAddPersonnel).toBe(true);
		});

		it('canAddPersonnel is false when scopedGroupId is set', () => {
			const ctx = new PersonnelPageContext(
				makeData({ permissions: { canEditPersonnel: true }, scopedGroupId: 'g1' }),
				makeModals(),
				makeOrg()
			);
			expect(ctx.canAddPersonnel).toBe(false);
		});

		it('canAddPersonnel is false when canEditPersonnel is false', () => {
			const ctx = new PersonnelPageContext(
				makeData({ permissions: { canEditPersonnel: false }, scopedGroupId: null }),
				makeModals(),
				makeOrg()
			);
			expect(ctx.canAddPersonnel).toBe(false);
		});

		it('canManageConfig is true when org isOwner', () => {
			const ctx = new PersonnelPageContext(
				makeData(),
				makeModals(),
				makeOrg({ isOwner: true, isAdmin: false, isFullEditor: false })
			);
			expect(ctx.canManageConfig).toBe(true);
		});

		it('canManageConfig is true when org isAdmin', () => {
			const ctx = new PersonnelPageContext(
				makeData(),
				makeModals(),
				makeOrg({ isOwner: false, isAdmin: true, isFullEditor: false })
			);
			expect(ctx.canManageConfig).toBe(true);
		});

		it('canManageConfig is false for plain member', () => {
			const ctx = new PersonnelPageContext(
				makeData(),
				makeModals(),
				makeOrg({ isOwner: false, isAdmin: false, isFullEditor: false })
			);
			expect(ctx.canManageConfig).toBe(false);
		});
	});

	describe('filtered personnel (search)', () => {
		it('returns all personnel when searchQuery is empty', () => {
			const people = [makePerson({ id: 'p1', lastName: 'Smith' }), makePerson({ id: 'p2', lastName: 'Jones' })];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), people);
			expect(ctx.filteredPersonnel).toHaveLength(2);
		});

		it('filters by lastName (case-insensitive)', () => {
			const people = [makePerson({ id: 'p1', lastName: 'Smith' }), makePerson({ id: 'p2', lastName: 'Jones' })];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), people);
			ctx.searchQuery = 'smith';
			expect(ctx.filteredPersonnel).toHaveLength(1);
			expect(ctx.filteredPersonnel[0].id).toBe('p1');
		});

		it('filters by firstName', () => {
			const people = [
				makePerson({ id: 'p1', firstName: 'Alice', lastName: 'Smith' }),
				makePerson({ id: 'p2', firstName: 'Bob', lastName: 'Smith' })
			];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), people);
			ctx.searchQuery = 'alice';
			expect(ctx.filteredPersonnel).toHaveLength(1);
			expect(ctx.filteredPersonnel[0].id).toBe('p1');
		});

		it('filters by rank', () => {
			const people = [makePerson({ id: 'p1', rank: 'CPT' }), makePerson({ id: 'p2', rank: 'SGT' })];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), people);
			ctx.searchQuery = 'CPT';
			expect(ctx.filteredPersonnel).toHaveLength(1);
			expect(ctx.filteredPersonnel[0].id).toBe('p1');
		});

		it('filters by clinicRole', () => {
			const people = [makePerson({ id: 'p1', clinicRole: 'Medic' }), makePerson({ id: 'p2', clinicRole: 'Admin' })];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), people);
			ctx.searchQuery = 'medic';
			expect(ctx.filteredPersonnel).toHaveLength(1);
			expect(ctx.filteredPersonnel[0].id).toBe('p1');
		});

		it('returns empty array when no matches', () => {
			const people = [makePerson({ lastName: 'Smith' })];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), people);
			ctx.searchQuery = 'zzz';
			expect(ctx.filteredPersonnel).toHaveLength(0);
		});

		it('ignores leading/trailing whitespace in search query', () => {
			const people = [makePerson({ id: 'p1', lastName: 'Smith' }), makePerson({ id: 'p2', lastName: 'Jones' })];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), people);
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
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), people);
			const sorted = ctx.alphabeticalPersonnel;
			expect(sorted[0].id).toBe('p2'); // Adams
			expect(sorted[1].id).toBe('p3'); // Smith, Alice
			expect(sorted[2].id).toBe('p1'); // Smith, Bob
		});
	});

	describe('totalPersonnel and filteredCount', () => {
		it('totalPersonnel reflects all personnel passed in', () => {
			const people = [makePerson({ id: 'p1' }), makePerson({ id: 'p2' }), makePerson({ id: 'p3' })];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), people);
			expect(ctx.totalPersonnel).toBe(3);
		});

		it('filteredCount in alphabetical mode equals alphabeticalPersonnel length after search', () => {
			const people = [makePerson({ id: 'p1', lastName: 'Smith' }), makePerson({ id: 'p2', lastName: 'Jones' })];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), people);
			ctx.viewMode = 'alphabetical';
			ctx.searchQuery = 'smith';
			expect(ctx.filteredCount).toBe(1);
		});
	});

	describe('rating scheme filtering', () => {
		it('hasAnyWorkflowStatus is false when no entries have workflowStatus', () => {
			const ctx = new PersonnelPageContext(
				makeData(),
				makeModals(),
				makeOrg(),
				[],
				[makeRatingEntry({ workflowStatus: null })]
			);
			expect(ctx.hasAnyWorkflowStatus).toBe(false);
		});

		it('hasAnyWorkflowStatus is true when any entry has workflowStatus', () => {
			const ctx = new PersonnelPageContext(
				makeData(),
				makeModals(),
				makeOrg(),
				[],
				[makeRatingEntry({ workflowStatus: 'drafting' })]
			);
			expect(ctx.hasAnyWorkflowStatus).toBe(true);
		});

		it('filteredRatingEntries filters by ratingFilter (active by default)', () => {
			const entries = [
				makeRatingEntry({ id: 'r1', status: 'active' }),
				makeRatingEntry({ id: 'r2', status: 'completed' }),
				makeRatingEntry({ id: 'r3', status: 'change-of-rater' })
			];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), [], entries);
			// default is 'active'
			expect(ctx.filteredRatingEntries).toHaveLength(1);
			expect(ctx.filteredRatingEntries[0].id).toBe('r1');
		});

		it('filteredRatingEntries returns all when ratingFilter is all', () => {
			const entries = [
				makeRatingEntry({ id: 'r1', status: 'active' }),
				makeRatingEntry({ id: 'r2', status: 'completed' })
			];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), [], entries);
			ctx.ratingFilter = 'all';
			expect(ctx.filteredRatingEntries).toHaveLength(2);
		});

		it('filteredRatingEntries filters by evalTypeFilter', () => {
			const entries = [
				makeRatingEntry({ id: 'r1', evalType: 'OER', status: 'active' }),
				makeRatingEntry({ id: 'r2', evalType: 'NCOER', status: 'active' })
			];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), [], entries);
			ctx.evalTypeFilter = 'OER';
			expect(ctx.filteredRatingEntries).toHaveLength(1);
			expect(ctx.filteredRatingEntries[0].id).toBe('r1');
		});

		it('filteredRatingEntries filters by workflowFilter', () => {
			const entries = [
				makeRatingEntry({ id: 'r1', status: 'active', workflowStatus: 'drafting' }),
				makeRatingEntry({ id: 'r2', status: 'active', workflowStatus: 'completed' })
			];
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg(), [], entries);
			ctx.workflowFilter = 'drafting';
			expect(ctx.filteredRatingEntries).toHaveLength(1);
			expect(ctx.filteredRatingEntries[0].id).toBe('r1');
		});
	});

	describe('modal handlers', () => {
		it('handleAdd opens personnel-modal with null person payload', () => {
			const modals = makeModals();
			const ctx = new PersonnelPageContext(makeData(), modals, makeOrg());
			ctx.handleAdd();
			expect(modals.isOpen('personnel-modal')).toBe(true);
			expect(modals.payload<{ person: Personnel | null }>('personnel-modal')?.person).toBeNull();
		});

		it('handleEdit opens personnel-modal with the person payload', () => {
			const person = makePerson();
			const modals = makeModals();
			const ctx = new PersonnelPageContext(makeData(), modals, makeOrg(), [person]);
			ctx.handleEdit(person);
			expect(modals.isOpen('personnel-modal')).toBe(true);
			expect(modals.payload<{ person: Personnel }>('personnel-modal')?.person).toBe(person);
		});

		it('handleAddRatingEntry opens rating-modal with null entry payload', () => {
			const modals = makeModals();
			const ctx = new PersonnelPageContext(makeData(), modals, makeOrg());
			ctx.handleAddRatingEntry();
			expect(modals.isOpen('rating-modal')).toBe(true);
			expect(modals.payload<{ entry: RatingSchemeEntry | null }>('rating-modal')?.entry).toBeNull();
		});

		it('handleEditRatingEntry opens rating-modal with the entry payload', () => {
			const entry = makeRatingEntry();
			const modals = makeModals();
			const ctx = new PersonnelPageContext(makeData(), modals, makeOrg(), [], [entry]);
			ctx.handleEditRatingEntry(entry);
			expect(modals.isOpen('rating-modal')).toBe(true);
			expect(modals.payload<{ entry: RatingSchemeEntry }>('rating-modal')?.entry).toBe(entry);
		});

		it('openGroupManager opens group-manager modal', () => {
			const modals = makeModals();
			const ctx = new PersonnelPageContext(makeData(), modals, makeOrg());
			ctx.openGroupManager();
			expect(modals.isOpen('group-manager')).toBe(true);
		});

		it('openBulkManager opens bulk-manager modal', () => {
			const modals = makeModals();
			const ctx = new PersonnelPageContext(makeData(), modals, makeOrg());
			ctx.openBulkManager();
			expect(modals.isOpen('bulk-manager')).toBe(true);
		});
	});

	describe('toggleGroup', () => {
		it('collapses an expanded group', () => {
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg());
			expect(ctx.collapsedGroups.has('Alpha')).toBe(false);
			ctx.toggleGroup('Alpha');
			expect(ctx.collapsedGroups.has('Alpha')).toBe(true);
		});

		it('expands a collapsed group', () => {
			const ctx = new PersonnelPageContext(makeData(), makeModals(), makeOrg());
			ctx.toggleGroup('Alpha');
			ctx.toggleGroup('Alpha');
			expect(ctx.collapsedGroups.has('Alpha')).toBe(false);
		});
	});
});
