import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrainingPageContext } from './TrainingPageContext.svelte';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import { createOrgContext, type OrgContext } from '$lib/stores/orgContext.svelte';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { Personnel } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { TrainingType } from '$features/training/training.types';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';

const { gotoMock, invalidateMock, queueUserPreferencesPatchMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	invalidateMock: vi.fn(),
	queueUserPreferencesPatchMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidate: invalidateMock
}));

vi.mock('$lib/preferences/userPreferences.client', () => ({
	queueUserPreferencesPatch: queueUserPreferencesPatchMock
}));

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeOrg(overrides: Partial<OrgContext> = {}): OrgContext {
	const org = createOrgContext({
		orgId: 'org-1',
		orgName: 'Test Org',
		userId: 'user-1',
		userRole: 'member',
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		},
		scopeSet: { kind: 'organization' },
		permissions: {
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewCriticalTasks: true,
			canEditCriticalTasks: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: false
		},
		scopedGroupId: null,
		isReadOnly: false
	});

	return Object.assign({}, org, overrides);
}

function makeCapabilityMap(training: CapabilityMap['training']): CapabilityMap {
	return {
		calendar: 'none',
		personnel: 'none',
		training,
		criticalTasks: 'none',
		onboarding: 'none',
		ratingScheme: 'none'
	};
}

function makePolicyOrg(options: { training: CapabilityMap['training']; readOnly?: boolean }): OrgContext {
	return createOrgContext({
		orgId: 'org-1',
		orgName: 'Test Org',
		userId: 'user-1',
		userRole: 'member',
		capabilityMap: makeCapabilityMap(options.training),
		scopeSet: { kind: 'organization' },
		permissions: {
			canViewCalendar: false,
			canEditCalendar: false,
			canViewPersonnel: false,
			canEditPersonnel: false,
			canViewTraining: true,
			canEditTraining: false,
			canViewCriticalTasks: false,
			canEditCriticalTasks: false,
			canViewOnboarding: false,
			canEditOnboarding: false,
			canViewLeadersBook: false,
			canEditLeadersBook: false,
			canManageMembers: false
		},
		scopedGroupId: null,
		isReadOnly: options.readOnly ?? false
	});
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
	appliesToRoles: [],
	appliesToMos: [],
	appliesToRanks: [],
	excludedRoles: [],
	excludedMos: [],
	excludedRanks: [],
	expirationDateOnly: false,
	canBeExempted: true,
	exemptPersonnelIds: ['p-1'],
	isOptional: false
};

const mockGroups: Group[] = [
	{ id: 'g-1', name: 'Alpha', sortOrder: 0 },
	{ id: 'g-2', name: 'Bravo', sortOrder: 1 }
];

function makeData(overrides: Record<string, unknown> = {}) {
	return {
		orgId: 'org-1',
		orgName: 'Test Org',
		permissions: {
			canViewTraining: true,
			canEditTraining: true
		},
		isOwner: false,
		isAdmin: false,
		isFullEditor: false,
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
		queueUserPreferencesPatchMock.mockReset();
		queueUserPreferencesPatchMock.mockResolvedValue(undefined);
		personnelStore.load([mockPerson, mockPerson2], 'org-1');
		groupsStore.load(mockGroups, 'org-1');
		trainingViewsStore.load([], 'org-1');
	});

	describe('canManageConfig', () => {
		it('is false without Training configure capability', () => {
			const org = makePolicyOrg({ training: 'operate' });
			const ctx = new TrainingPageContext(makeData(), modals, org);
			expect(ctx.canManageConfig).toBe(false);
		});

		it('uses Training configure policy instead of legacy full-editor state', () => {
			const org = makePolicyOrg({ training: 'configure' });
			const ctx = new TrainingPageContext(makeData(), modals, org);
			expect(ctx.canManageConfig).toBe(true);
		});

		it('keeps configuration affordances visible during read-only mode', () => {
			const org = makePolicyOrg({ training: 'configure', readOnly: true });
			const ctx = new TrainingPageContext(makeData(), modals, org);
			expect(ctx.canManageConfig).toBe(true);
		});
	});

	describe('training policy affordances', () => {
		it('allows an operator to record completions even when legacy canEditTraining is false', () => {
			const org = makePolicyOrg({ training: 'operate' });
			const ctx = new TrainingPageContext(
				makeData({
					permissions: {
						canViewTraining: true,
						canEditTraining: false
					}
				}),
				modals,
				org
			);

			expect(ctx.canViewTraining).toBe(true);
			expect(ctx.canRecordTraining).toBe(true);
		});

		it('denies record affordances for view-only and read-only policy states', () => {
			const viewOnly = new TrainingPageContext(makeData(), modals, makePolicyOrg({ training: 'view' }));
			const readOnlyOperator = new TrainingPageContext(
				makeData(),
				modals,
				makePolicyOrg({ training: 'operate', readOnly: true })
			);

			expect(viewOnly.canRecordTraining).toBe(false);
			expect(readOnlyOperator.canRecordTraining).toBe(false);
		});

		it('uses Training view policy instead of legacy canViewTraining', () => {
			const ctx = new TrainingPageContext(
				makeData({
					permissions: {
						canViewTraining: true,
						canEditTraining: true
					}
				}),
				modals,
				makePolicyOrg({ training: 'none' })
			);

			expect(ctx.canViewTraining).toBe(false);
		});
	});

	describe('availableRoles', () => {
		it('returns sorted unique non-null clinic roles', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			// mockPerson has null clinicRole, mockPerson2 has 'Medic'
			expect(ctx.availableRoles).toEqual(['Medic']);
		});

		it('returns empty array when no roles', () => {
			personnelStore.load([{ ...mockPerson, clinicRole: null } as unknown as Personnel], 'org-1');
			const data = makeData();
			const ctx = new TrainingPageContext(data, modals, makeOrg());
			expect(ctx.availableRoles).toEqual([]);
		});
	});

	it('reads personnel from the hydrated personnel store', () => {
		const workspacePerson = { ...mockPerson, id: 'workspace-person', lastName: 'Workspace' };
		personnelStore.load([workspacePerson], 'org-1');
		const data = makeData();

		const ctx = new TrainingPageContext(data, modals, makeOrg());

		expect(ctx.personnel).toEqual([workspacePerson]);
		expect(ctx.filteredPersonnel[0].id).toBe('workspace-person');
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

	describe('groups', () => {
		it('reads groups from the hydrated groups store', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());

			expect(ctx.groups).toEqual(mockGroups);
			expect(ctx.groupOrder).toEqual(['Alpha', 'Bravo']);
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
			const org = makePolicyOrg({ training: 'operate' });
			const ctx = new TrainingPageContext(makeData(), modals, org);
			const labels = ctx.trainingOverflowItems.map((i) => i.label);
			expect(labels).not.toContain('Bulk Import');
			expect(labels).not.toContain('Manage Types');
			expect(labels).not.toContain('Reorder Columns');
		});

		it('includes config items with Training configure capability', () => {
			const org = makePolicyOrg({ training: 'configure' });
			const ctx = new TrainingPageContext(makeData(), modals, org);
			const labels = ctx.trainingOverflowItems.map((i) => i.label);
			expect(labels).toContain('Bulk Import');
			expect(labels).toContain('Manage Types');
		});
	});

	it('propagates training save failures', async () => {
		const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
		vi.spyOn(personnelTrainingsStore, 'add').mockRejectedValueOnce(new Error('insert blocked by policy'));

		await expect(
			ctx.handleSaveTraining({
				personnelId: mockPerson.id,
				trainingTypeId: mockType.id,
				completionDate: '2026-04-06',
				expirationDate: '2027-04-06',
				notes: null,
				certificateUrl: null
			})
		).rejects.toThrow('insert blocked by policy');
	});

	describe('default viewMode', () => {
		it('defaults to by-group', () => {
			const ctx = new TrainingPageContext(makeData(), modals, makeOrg());
			expect(ctx.viewMode).toBe('by-group');
		});

		it('hydrates persisted training preferences when available', () => {
			trainingViewsStore.load(
				[{ id: 'view-1', name: 'Required', columnIds: [], createdBy: 'u1', createdAt: '', updatedAt: '' }],
				'org-1'
			);
			const ctx = new TrainingPageContext(
				makeData({
					userPreferences: {
						...getDefaultUserOrgPreferences(),
						training: {
							selectedGroupId: 'g-1',
							selectedViewId: 'view-1',
							matrixViewMode: 'alphabetical'
						}
					}
				}),
				modals,
				makeOrg()
			);

			expect(ctx.selectedGroupId).toBe('g-1');
			expect(ctx.selectedViewId).toBe('view-1');
			expect(ctx.viewMode).toBe('alphabetical');
		});

		it('clears invalid persisted group and view selections after hydrated stores arrive', () => {
			groupsStore.load([], 'org-stale');
			trainingViewsStore.load([], 'org-stale');

			const ctx = new TrainingPageContext(
				makeData({
					userPreferences: {
						...getDefaultUserOrgPreferences(),
						training: {
							selectedGroupId: 'missing-group',
							selectedViewId: 'missing-view',
							matrixViewMode: 'alphabetical'
						}
					}
				}),
				modals,
				makeOrg()
			);

			expect(ctx.selectedGroupId).toBe('missing-group');
			expect(ctx.selectedViewId).toBe('missing-view');

			groupsStore.load(mockGroups, 'org-1');
			trainingViewsStore.load(
				[{ id: 'view-1', name: 'Required', columnIds: [], createdBy: 'u1', createdAt: '', updatedAt: '' }],
				'org-1'
			);

			expect(ctx.filteredPersonnel).toHaveLength(2);
			expect(ctx.selectedGroupId).toBe('');
			expect(ctx.selectedViewId).toBeNull();
		});

		it('persists a reconciled selection patch only once even when multiple getters are read', () => {
			groupsStore.load([], 'org-stale');
			trainingViewsStore.load([], 'org-stale');

			const ctx = new TrainingPageContext(
				makeData({
					userPreferences: {
						...getDefaultUserOrgPreferences(),
						training: {
							selectedGroupId: 'missing-group',
							selectedViewId: 'missing-view',
							matrixViewMode: 'alphabetical'
						}
					}
				}),
				modals,
				makeOrg()
			);

			groupsStore.load(mockGroups, 'org-1');
			trainingViewsStore.load(
				[{ id: 'view-1', name: 'Required', columnIds: [], createdBy: 'u1', createdAt: '', updatedAt: '' }],
				'org-1'
			);

			void ctx.personnel;
			void ctx.groups;
			void ctx.savedViewIds;
			void ctx.basePersonnel;
			void ctx.filteredPersonnel;

			expect(queueUserPreferencesPatchMock).toHaveBeenCalledTimes(1);
			expect(queueUserPreferencesPatchMock).toHaveBeenCalledWith('org-1', {
				training: {
					selectedGroupId: null,
					selectedViewId: null
				}
			});
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
