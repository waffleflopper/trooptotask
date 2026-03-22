import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrainingPageContext } from './TrainingPageContext.svelte';
import type { OrgContext } from '$lib/stores/orgContext.svelte';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { Personnel } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeOrg(overrides: Partial<OrgContext> = {}): OrgContext {
	return {
		orgId: 'org-1',
		orgName: 'Test Org',
		userId: 'user-1',
		role: 'member',
		isOwner: false,
		isAdmin: false,
		isPrivileged: false,
		isFullEditor: false,
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
			canManageMembers: false
		},
		scopedGroupId: null,
		readOnly: false,
		...overrides
	};
}

function makeModals(): ModalRegistry {
	const opened: Record<string, unknown> = {};
	return {
		isOpen: (id: string) => id in opened,
		open: (id: string, payload?: unknown) => {
			opened[id] = payload ?? null;
		},
		close: (id: string) => {
			delete opened[id];
		},
		closeAll: () => Object.keys(opened).forEach((k) => delete opened[k]),
		closerFor: (id: string) => () => delete opened[id],
		payload: <T>(id: string) => opened[id] as T | undefined
	} as unknown as ModalRegistry;
}

const mockPerson: Personnel = {
	id: 'p-1',
	firstName: 'Jane',
	lastName: 'Smith',
	rank: 'SGT',
	clinicRole: null,
	groupId: 'g-1',
	groupName: 'Alpha',
	orgId: 'org-1',
	phone: null,
	email: null,
	notes: null,
	archivedAt: null
} as unknown as Personnel;

const mockPerson2: Personnel = {
	id: 'p-2',
	firstName: 'Aaron',
	lastName: 'Adams',
	rank: 'SPC',
	clinicRole: 'Medic',
	groupId: 'g-2',
	groupName: 'Bravo',
	orgId: 'org-1',
	phone: null,
	email: null,
	notes: null,
	archivedAt: null
} as unknown as Personnel;

const mockType: TrainingType = {
	id: 't-1',
	name: 'CPR',
	sortOrder: 0,
	color: '#3b82f6',
	description: null,
	expirationMonths: 12,
	warningDaysYellow: 60,
	warningDaysOrange: 30,
	requiredForRoles: [],
	expirationDateOnly: false,
	canBeExempted: true,
	exemptPersonnelIds: ['p-1']
};

function makeData(overrides: Record<string, unknown> = {}) {
	return {
		orgId: 'org-1',
		orgName: 'Test Org',
		personnel: [mockPerson, mockPerson2],
		groups: [
			{ id: 'g-1', name: 'Alpha', sortOrder: 0 },
			{ id: 'g-2', name: 'Bravo', sortOrder: 1 }
		],
		permissions: {
			canViewTraining: true,
			canEditTraining: true
		},
		isOwner: false,
		isAdmin: false,
		isFullEditor: false,
		trainingTypes: [],
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrainingPageContext', () => {
	let modals: ModalRegistry;

	beforeEach(() => {
		vi.restoreAllMocks();
		modals = makeModals();
	});

	describe('canManageConfig', () => {
		it('is false for a plain member', () => {
			const org = makeOrg({ isOwner: false, isAdmin: false, isFullEditor: false });
			const ctx = new TrainingPageContext(makeData(), modals, org);
			expect(ctx.canManageConfig).toBe(false);
		});

		it('is true for an owner', () => {
			const org = makeOrg({ isOwner: true });
			const ctx = new TrainingPageContext(makeData(), modals, org);
			expect(ctx.canManageConfig).toBe(true);
		});

		it('is true for an admin', () => {
			const org = makeOrg({ isAdmin: true });
			const ctx = new TrainingPageContext(makeData(), modals, org);
			expect(ctx.canManageConfig).toBe(true);
		});

		it('is true for a full editor', () => {
			const org = makeOrg({ isFullEditor: true });
			const ctx = new TrainingPageContext(makeData(), modals, org);
			expect(ctx.canManageConfig).toBe(true);
		});
	});

	describe('availableRoles', () => {
		it('returns sorted unique non-null clinic roles', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			// mockPerson has null clinicRole, mockPerson2 has 'Medic'
			expect(ctx.availableRoles).toEqual(['Medic']);
		});

		it('returns empty array when no roles', () => {
			const data = makeData({ personnel: [{ ...mockPerson, clinicRole: null }] });
			const ctx = new TrainingPageContext(data, modals, makeOrg());
			expect(ctx.availableRoles).toEqual([]);
		});
	});

	describe('filteredPersonnel', () => {
		it('returns all personnel sorted by last name when no group selected', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			// Adams before Smith
			expect(ctx.filteredPersonnel[0].lastName).toBe('Adams');
			expect(ctx.filteredPersonnel[1].lastName).toBe('Smith');
		});

		it('filters by selectedGroupId', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			ctx.selectedGroupId = 'g-1';
			expect(ctx.filteredPersonnel).toHaveLength(1);
			expect(ctx.filteredPersonnel[0].id).toBe('p-1');
		});
	});

	describe('trainingOverflowItems', () => {
		it('always includes Sign-In Rosters and Reports', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			const labels = ctx.trainingOverflowItems.map((i) => i.label);
			expect(labels).toContain('Sign-In Rosters');
			expect(labels).toContain('Reports');
		});

		it('excludes config items for plain member', () => {
			const org = makeOrg({ isOwner: false, isAdmin: false, isFullEditor: false });
			const ctx = new TrainingPageContext(makeData(), modals, org);
			const labels = ctx.trainingOverflowItems.map((i) => i.label);
			expect(labels).not.toContain('Bulk Import');
			expect(labels).not.toContain('Manage Types');
			expect(labels).not.toContain('Reorder Columns');
		});

		it('includes config items for owner', () => {
			const org = makeOrg({ isOwner: true });
			const ctx = new TrainingPageContext(makeData(), modals, org);
			const labels = ctx.trainingOverflowItems.map((i) => i.label);
			expect(labels).toContain('Bulk Import');
			expect(labels).toContain('Manage Types');
			expect(labels).toContain('Reorder Columns');
		});
	});

	describe('toggleGroup', () => {
		it('adds a group to collapsedGroups', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			expect(ctx.collapsedGroups.has('Alpha')).toBe(false);
			ctx.toggleGroup('Alpha');
			expect(ctx.collapsedGroups.has('Alpha')).toBe(true);
		});

		it('removes a group already in collapsedGroups', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			ctx.toggleGroup('Alpha');
			ctx.toggleGroup('Alpha');
			expect(ctx.collapsedGroups.has('Alpha')).toBe(false);
		});
	});

	describe('handleCellClick', () => {
		it('opens the record modal with the correct payload', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			ctx.handleCellClick(mockPerson, mockType, undefined);
			expect(modals.isOpen('record')).toBe(true);
			const payload = modals.payload<{ person: Personnel; type: TrainingType }>('record');
			expect(payload?.person.id).toBe('p-1');
			expect(payload?.type.id).toBe('t-1');
		});
	});

	describe('handlePersonClick', () => {
		it('opens the person-editor modal with the person', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			ctx.handlePersonClick(mockPerson);
			expect(modals.isOpen('person-editor')).toBe(true);
			const payload = modals.payload<{ person: Personnel }>('person-editor');
			expect(payload?.person.id).toBe('p-1');
		});
	});

	describe('isExempt', () => {
		it('returns true when person is in exemptPersonnelIds', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			expect(ctx.isExempt(mockPerson, mockType)).toBe(true);
		});

		it('returns false when person is not exempt', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			expect(ctx.isExempt(mockPerson2, mockType)).toBe(false);
		});

		it('returns false when type cannot be exempted', () => {
			const nonExemptType = { ...mockType, canBeExempted: false };
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			expect(ctx.isExempt(mockPerson, nonExemptType)).toBe(false);
		});
	});
});
