import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrainingPageContext } from './TrainingPageContext.svelte';
const getDefaultUserOrgPreferences = () => ({
	training: { selectedGroupId: null, selectedViewId: null, matrixViewMode: 'by-group' as const }
});
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import type { RankCatalogEntry } from '$features/personnel/contracts';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { Group } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { personnelRosterHydration } from '$features/personnel';
import { groupCatalogHydration } from '$features/personnel';
import { trainingRankCatalogStore } from '$features/training/stores/rankCatalog.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { submitDeletionRequest } from '$features/deletion-requests/submission.test-support';
import { toastStore } from '$lib/stores/toast.svelte';

const { gotoMock, invalidateMock, savePreferencesMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	invalidateMock: vi.fn(),
	savePreferencesMock: vi.fn()
}));

async function waitForAsyncSideEffect(assertion: () => void): Promise<void> {
	const timeoutAt = Date.now() + 1000;
	let lastError: unknown;

	while (Date.now() < timeoutAt) {
		try {
			assertion();
			return;
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}

	if (lastError instanceof Error) throw lastError;
	throw new Error('Timed out waiting for async side effect');
}

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidate: invalidateMock,
	invalidateAll: vi.fn()
}));

function makeOrg() {
	return {
		orgId: 'test-org',
		orgUrlSegment: 'test-org',
		...createClientAccess({ membershipRole: 'member', capabilityMap: createCapabilityMap('configure') })
	};
}

function makeModals() {
	return new ModalRegistry();
}

function makePolicyOrg(options: { training: CapabilityMap['training'] }) {
	return {
		orgId: 'test-org',
		orgUrlSegment: 'test-org',
		...createClientAccess({
			membershipRole: 'member',
			capabilityMap: { ...createCapabilityMap('none'), training: options.training }
		})
	};
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

const unassignedPerson: Personnel = {
	id: 'p-unassigned',
	firstName: 'Taylor',
	lastName: 'NoGroup',
	rank: 'PFC',
	clinicRole: 'Medic',
	groupId: null,
	groupName: '',
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
	{ id: 'g-2', name: 'Bravo', sortOrder: 1 },
	{ id: 'g-empty', name: 'Charlie', sortOrder: 2 }
];

function makeData(overrides: Record<string, unknown> = {}) {
	return {
		orgId: 'org-1',
		orgName: 'Test Org',
		isOwner: false,
		isAdmin: false,
		...overrides
	};
}

const submitRemovalRequest = vi.fn().mockResolvedValue(true);
type ContextArgs = ConstructorParameters<typeof TrainingPageContext>;
function makeContext(data: ContextArgs[0], modals: ContextArgs[1], org: ContextArgs[2]) {
	return new TrainingPageContext(data, modals, org, submitRemovalRequest, savePreferencesMock);
}

describe('TrainingPageContext', () => {
	let modals: ModalRegistry;

	beforeEach(() => {
		vi.restoreAllMocks();
		submitRemovalRequest.mockReset().mockResolvedValue(true);
		vi.unstubAllGlobals();
		modals = makeModals();
		savePreferencesMock.mockReset();
		personnelRosterHydration.load([mockPerson, mockPerson2], 'org-1');
		groupCatalogHydration.load(mockGroups, 'org-1');
		trainingRankCatalogStore.load([], 'org-1');
		trainingViewsStore.load([], 'org-1');
		trainingTypesStore.load([], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
	});

	describe('handleToggleExempt', () => {
		it.each([
			[true, 400, 'That Training type is no longer available.', 'That Training type is no longer available.'],
			[true, 500, 'Internal server error', 'Failed to mark exempt. Try again.'],
			[false, 500, 'Internal server error', 'Failed to remove exemption. Try again.']
		] as const)(
			'keeps the saved exemption and says why when exempt=%s is refused with %i',
			async (exempt, status, serverMessage, shown) => {
				const saved = { ...mockType, canBeExempted: true, exemptPersonnelIds: exempt ? [] : [mockPerson.id] };
				trainingTypesStore.load([saved], 'org-1');
				vi.stubGlobal('fetch', async () => Response.json({ message: serverMessage }, { status }));
				const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'error');
				const ctx = makeContext(makeData(), modals, makePolicyOrg({ training: 'configure' }));

				await ctx.handleToggleExempt(saved.id, mockPerson.id, exempt);

				expect(errorToast).toHaveBeenCalledExactlyOnceWith(shown);
				expect(trainingTypesStore.items[0].exemptPersonnelIds).toEqual(saved.exemptPersonnelIds);
			}
		);
	});

	describe('canManageConfig', () => {
		it('is false without Training configure capability', () => {
			const org = makePolicyOrg({ training: 'operate' });
			const ctx = makeContext(makeData(), modals, org);
			expect(ctx.canManageConfig).toBe(false);
		});

		it('uses Training configure policy instead of legacy full-editor state', () => {
			const org = makePolicyOrg({ training: 'configure' });
			const ctx = makeContext(makeData(), modals, org);
			expect(ctx.canManageConfig).toBe(true);
		});

		it('keeps Group-scoped configurators in the matrix without Organization-wide controls', () => {
			const org = {
				orgId: 'test-org',
				orgUrlSegment: 'test-org',
				...createClientAccess({
					membershipRole: 'member',
					capabilityMap: { ...createCapabilityMap('none'), training: 'configure' },
					scopeSet: { kind: 'groups', groupIds: ['g-1'] }
				})
			};
			const ctx = makeContext(makeData(), modals, org);

			expect(ctx.canViewTraining).toBe(true);
			expect(ctx.canManageConfig).toBe(false);
		});
	});

	describe('training policy affordances', () => {
		it('allows an operator to record completions with Training operate capability', () => {
			const org = makePolicyOrg({ training: 'operate' });
			const ctx = makeContext(makeData(), modals, org);

			expect(ctx.canViewTraining).toBe(true);
			expect(ctx.canRecordTraining).toBe(true);
		});

		it('denies record affordances for view-only capability', () => {
			const viewOnly = makeContext(makeData(), modals, makePolicyOrg({ training: 'view' }));

			expect(viewOnly.canRecordTraining).toBe(false);
		});

		it('uses Training view policy for page visibility', () => {
			const ctx = makeContext(makeData(), modals, makePolicyOrg({ training: 'none' }));

			expect(ctx.canViewTraining).toBe(false);
		});
	});

	describe('availableRoles', () => {
		it('returns sorted unique non-null clinic roles', () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			// mockPerson has null clinicRole, mockPerson2 has 'Medic'
			expect(ctx.availableRoles).toEqual(['Medic']);
		});

		it('returns empty array when no roles', () => {
			personnelRosterHydration.load([{ ...mockPerson, clinicRole: null } as unknown as Personnel], 'org-1');
			const data = makeData();
			const ctx = makeContext(data, modals, makeOrg());
			expect(ctx.availableRoles).toEqual([]);
		});
	});

	it('reads personnel from the hydrated personnel store', () => {
		const workspacePerson = { ...mockPerson, id: 'workspace-person', lastName: 'Workspace' };
		personnelRosterHydration.load([workspacePerson], 'org-1');
		const data = makeData();

		const ctx = makeContext(data, modals, makeOrg());

		expect(ctx.personnel).toEqual([workspacePerson]);
		expect(ctx.filteredPersonnel[0].id).toBe('workspace-person');
	});

	describe('filteredPersonnel', () => {
		it('returns all personnel sorted by last name when no group selected', () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			expect(ctx.filteredPersonnel[0].lastName).toBe('Adams');
			expect(ctx.filteredPersonnel[1].lastName).toBe('Smith');
		});

		it('filters by selectedGroupId', () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.selectedGroupId = 'g-1';
			expect(ctx.filteredPersonnel).toHaveLength(1);
			expect(ctx.filteredPersonnel[0].id).toBe('p-1');
		});

		it('filters unassigned personnel through the roster group filter value', async () => {
			personnelRosterHydration.load([mockPerson, mockPerson2, unassignedPerson], 'org-1');
			const ctx = makeContext(makeData(), modals, makeOrg());

			expect(ctx.groupFilterOptions).toContainEqual({ value: 'name:Unassigned', label: 'Unassigned' });

			ctx.setSelectedGroupId('name:Unassigned');

			expect(ctx.filteredPersonnel.map((person) => person.id)).toEqual(['p-unassigned']);
			await waitForAsyncSideEffect(() => {
				expect(savePreferencesMock).toHaveBeenCalledWith({
					training: { selectedGroupId: 'name:Unassigned' }
				});
			});
		});

		it('narrows the group-filtered rows by the search query', () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.searchQuery = 'adams';
			expect(ctx.filteredPersonnel.map((person) => person.id)).toEqual(['p-2']);

			ctx.selectedGroupId = 'g-1';
			expect(ctx.filteredPersonnel).toEqual([]);

			ctx.searchQuery = '';
			expect(ctx.filteredPersonnel.map((person) => person.id)).toEqual(['p-1']);
		});

		it('preserves an empty group selection after stores hydrate', () => {
			const ctx = makeContext(
				makeData({
					userPreferences: {
						...getDefaultUserOrgPreferences(),
						training: {
							selectedGroupId: 'g-empty',
							selectedViewId: null,
							matrixViewMode: 'by-group'
						}
					}
				}),
				modals,
				makeOrg()
			);

			expect(ctx.groupFilterOptions).toContainEqual({ value: 'g-empty', label: 'Charlie' });
			expect(ctx.filteredPersonnel).toEqual([]);
			expect(ctx.selectedGroupId).toBe('g-empty');
			expect(savePreferencesMock).not.toHaveBeenCalled();
		});
	});

	describe('groups', () => {
		it('reads groups from the hydrated groups store', () => {
			const ctx = makeContext(makeData(), modals, makeOrg());

			expect(ctx.groups).toEqual(mockGroups);
		});
	});

	describe('rankCatalog', () => {
		it('exposes the hydrated Organization rank catalog used by Sign-In Rosters', () => {
			const catalog = [
				rankCatalogEntry({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy' }),
				rankCatalogEntry({ code: 'SSgt', label: 'Staff Sergeant', service: 'air-force' })
			];
			trainingRankCatalogStore.load(catalog, 'org-1');

			const ctx = makeContext(makeData(), modals, makeOrg());

			expect(ctx.rankCatalog).toEqual(catalog);
		});
	});

	it('propagates training save failures', async () => {
		const ctx = makeContext(makeData(), modals, makeOrg());
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

	it('rejects a failed removal without losing the stored record and succeeds on retry', async () => {
		const record: PersonnelTraining = {
			id: 'record-1',
			personnelId: mockPerson.id,
			trainingTypeId: mockType.id,
			completionDate: '2026-01-05',
			expirationDate: '2027-01-05',
			notes: 'Retain me',
			certificateUrl: null
		};
		personnelTrainingsStore.load([record], 'org-1');
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(new Response(null, { status: 503 }))
				.mockResolvedValueOnce(new Response(null, { status: 200 }))
		);
		const ctx = makeContext(makeData(), modals, makeOrg());
		await expect(ctx.handleRemoveTraining(record.id)).rejects.toThrow();
		expect(personnelTrainingsStore.items).toEqual([record]);
		await expect(ctx.handleRemoveTraining(record.id)).resolves.toBeUndefined();
		expect(personnelTrainingsStore.items).toEqual([]);
	});

	it('retains the completion on failed submission and retries through the bound removal callback', async () => {
		trainingTypesStore.load([mockType], 'org-1');
		const record: PersonnelTraining = {
			id: 'record-1',
			personnelId: mockPerson.id,
			trainingTypeId: mockType.id,
			completionDate: null,
			expirationDate: null,
			notes: 'Awaiting approval',
			certificateUrl: null
		};
		personnelTrainingsStore.load([record], 'org-1');
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(Response.json({ requiresApproval: true }, { status: 202 }))
				.mockResolvedValueOnce(Response.json({ requiresApproval: true }, { status: 202 }))
		);
		submitRemovalRequest.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		const ctx = makeContext(makeData(), modals, makeOrg());
		await expect(ctx.handleRemoveTraining(record.id)).rejects.toThrow();
		expect(personnelTrainingsStore.items).toEqual([record]);
		await expect(ctx.handleRemoveTraining(record.id)).resolves.toBeUndefined();
		expect(submitRemovalRequest.mock.calls.map((call) => call.slice(0, 5))).toEqual([
			[
				'org-1',
				'personnel_training',
				record.id,
				`${mockType.name} record for ${mockPerson.rank} ${mockPerson.lastName}`,
				'/org/org-1/training'
			],
			[
				'org-1',
				'personnel_training',
				record.id,
				`${mockType.name} record for ${mockPerson.rank} ${mockPerson.lastName}`,
				'/org/org-1/training'
			]
		]);
		expect(personnelTrainingsStore.items).toEqual([record]);
	});

	it.each(['another Organization loads', 'its editor closes'] as const)(
		'keeps an already-dispatched approval acknowledgement quiet after %s',
		async (retirement) => {
			trainingTypesStore.load([mockType], 'org-1');
			const record: PersonnelTraining = {
				id: 'record-1',
				personnelId: mockPerson.id,
				trainingTypeId: mockType.id,
				completionDate: null,
				expirationDate: null,
				notes: 'Organization A original',
				certificateUrl: null
			};
			personnelTrainingsStore.load([record], 'org-1');
			let resolveApproval!: (response: Response) => void;
			const approval = new Promise<Response>((resolve) => {
				resolveApproval = resolve;
			});
			const request = vi
				.fn()
				.mockResolvedValueOnce(Response.json({ requiresApproval: true }, { status: 202 }))
				.mockReturnValueOnce(approval);
			vi.stubGlobal('fetch', request);
			const infoToast = vi.spyOn(toastStore, 'info').mockImplementation(() => 'info');
			const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'error');
			const ctx = new TrainingPageContext(
				makeData(),
				modals,
				makePolicyOrg({ training: 'operate' }),
				submitDeletionRequest,
				savePreferencesMock
			);
			let editorCurrent = true;
			const removal = ctx
				.handleRemoveTraining(record.id, () => editorCurrent)
				.then(
					() => null,
					(error: unknown) => error
				);
			await waitForAsyncSideEffect(() => expect(request).toHaveBeenCalledTimes(2));
			expect(request.mock.calls[1][0]).toBe('/org/org-1/api/deletion-requests');
			expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({
				resourceType: 'personnel_training',
				resourceId: 'record-1',
				resourceDescription: 'CPR record for SGT Smith',
				resourceUrl: '/org/org-1/training'
			});
			const destination: PersonnelTraining = {
				id: 'record-b',
				personnelId: 'person-b',
				trainingTypeId: 'type-b',
				completionDate: null,
				expirationDate: null,
				notes: 'Organization B original',
				certificateUrl: null
			};
			if (retirement === 'another Organization loads') personnelTrainingsStore.load([destination], 'org-b');
			else editorCurrent = false;
			resolveApproval(new Response(null, { status: 201 }));
			const settlement = await removal;

			expect({
				rows: personnelTrainingsStore.items,
				info: infoToast.mock.calls.length,
				error: errorToast.mock.calls.length,
				settlement
			}).toEqual({
				rows: retirement === 'another Organization loads' ? [destination] : [record],
				info: 0,
				error: 0,
				settlement: null
			});
		}
	);

	describe('handleSaveTrainingBatch', () => {
		const batchRecords = [
			{
				personnelId: mockPerson.id,
				trainingTypeId: mockType.id,
				completionDate: '2026-04-06',
				status: 'completed' as const
			}
		];

		const insertedTraining: PersonnelTraining = {
			id: 'training-inserted',
			personnelId: mockPerson.id,
			trainingTypeId: mockType.id,
			completionDate: '2026-04-06',
			expirationDate: '2027-04-06',
			notes: null,
			certificateUrl: null
		};

		const updatedTraining: PersonnelTraining = {
			...insertedTraining,
			id: 'training-updated',
			completionDate: '2026-05-01',
			expirationDate: '2027-05-01'
		};

		it('posts one batch request and merges inserted and updated results', async () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			personnelTrainingsStore.load([{ ...updatedTraining, notes: 'Original notes' }], 'org-1');
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ inserted: [insertedTraining], updated: [updatedTraining] })
			});
			vi.stubGlobal('fetch', fetchMock);

			await ctx.handleSaveTrainingBatch(batchRecords);

			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel-trainings/batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ records: batchRecords })
			});
			expect(personnelTrainingsStore.items).toEqual([updatedTraining, insertedTraining]);
		});

		it('throws on non-OK response and does not mutate the training store', async () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			personnelTrainingsStore.load([updatedTraining], 'org-1');
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: false,
					status: 403,
					json: () => Promise.resolve({ message: 'recording denied' })
				})
			);

			await expect(ctx.handleSaveTrainingBatch(batchRecords)).rejects.toThrow('recording denied');
			expect(personnelTrainingsStore.items).toEqual([updatedTraining]);
		});

		it('keeps the destination Organization records unchanged when an old batch response arrives', async () => {
			personnelTrainingsStore.load([], 'org-1');
			const ctx = makeContext(makeData(), modals, makeOrg());
			let respond!: (response: Response) => void;
			const response = new Promise<Response>((resolve) => {
				respond = resolve;
			});
			vi.stubGlobal('fetch', vi.fn().mockReturnValue(response));
			const save = ctx.handleSaveTrainingBatch(batchRecords);
			const destinationRecord: PersonnelTraining = {
				id: 'destination-training',
				personnelId: 'destination-person',
				trainingTypeId: 'destination-type',
				completionDate: '2026-09-01',
				expirationDate: null,
				notes: 'Organization B original',
				certificateUrl: null
			};
			personnelTrainingsStore.load([destinationRecord], 'org-2');

			respond(Response.json({ inserted: [insertedTraining], updated: [] }));
			await save;

			expect(personnelTrainingsStore.items).toEqual([destinationRecord]);
		});
	});

	it.each(['success', 'failure'] as const)(
		'keeps a disposed workspace batch quiet after a late %s on returning to its Organization',
		async (outcome) => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			let resolve!: (response: Response) => void;
			let reject!: (error: Error) => void;
			const pending = new Promise<Response>((yes, no) => {
				resolve = yes;
				reject = no;
			});
			vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));
			const save = ctx
				.handleSaveTrainingBatch([
					{ personnelId: mockPerson.id, trainingTypeId: mockType.id, completionDate: '2026-10-06', status: 'completed' }
				])
				.then(
					() => null,
					(error: unknown) => error
				);
			ctx.dispose();
			personnelTrainingsStore.load([], 'org-b');
			const replacement: PersonnelTraining = {
				id: 'replacement-record',
				personnelId: mockPerson.id,
				trainingTypeId: mockType.id,
				completionDate: null,
				expirationDate: null,
				notes: 'Replacement workspace original',
				certificateUrl: null
			};
			personnelTrainingsStore.load([replacement], 'org-1');
			if (outcome === 'success')
				resolve(Response.json({ inserted: [{ ...replacement, id: 'retired-record' }], updated: [] }));
			else reject(new Error('Retired transport failure'));
			const settlement = await save;
			expect({ rows: personnelTrainingsStore.items, settlement }).toEqual({
				rows: [replacement],
				settlement: null
			});
		}
	);

	describe('default viewMode', () => {
		it('defaults to by-group', () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			expect(ctx.viewMode).toBe('by-group');
		});

		it('hydrates persisted training preferences when available', () => {
			trainingViewsStore.load(
				[{ id: 'view-1', name: 'Required', columnIds: [], createdBy: 'u1', createdAt: '', updatedAt: '' }],
				'org-1'
			);
			const ctx = makeContext(
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
			groupCatalogHydration.load([], 'org-stale');
			trainingViewsStore.load([], 'org-stale');

			const ctx = makeContext(
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

			groupCatalogHydration.load(mockGroups, 'org-1');
			trainingViewsStore.load(
				[{ id: 'view-1', name: 'Required', columnIds: [], createdBy: 'u1', createdAt: '', updatedAt: '' }],
				'org-1'
			);

			expect(ctx.filteredPersonnel).toHaveLength(2);
			expect(ctx.selectedGroupId).toBe('');
			expect(ctx.selectedViewId).toBeNull();
		});

		it('persists a reconciled selection patch only once even when multiple getters are read', async () => {
			groupCatalogHydration.load([], 'org-stale');
			trainingViewsStore.load([], 'org-stale');

			const ctx = makeContext(
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

			groupCatalogHydration.load(mockGroups, 'org-1');
			trainingViewsStore.load(
				[{ id: 'view-1', name: 'Required', columnIds: [], createdBy: 'u1', createdAt: '', updatedAt: '' }],
				'org-1'
			);

			void ctx.personnel;
			void ctx.groups;
			void ctx.savedViewIds;
			void ctx.basePersonnel;
			void ctx.filteredPersonnel;

			await waitForAsyncSideEffect(() => {
				expect(savePreferencesMock).toHaveBeenCalledTimes(1);
				expect(savePreferencesMock).toHaveBeenCalledWith({
					training: {
						selectedGroupId: null,
						selectedViewId: null
					}
				});
			});
		});
	});

	describe('toggleGroup', () => {
		it('adds a group to collapsedGroups', () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			expect(ctx.collapsedGroups.has('Alpha')).toBe(false);
			ctx.toggleGroup('Alpha');
			expect(ctx.collapsedGroups.has('Alpha')).toBe(true);
		});

		it('removes a group already in collapsedGroups', () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.toggleGroup('Alpha');
			ctx.toggleGroup('Alpha');
			expect(ctx.collapsedGroups.has('Alpha')).toBe(false);
		});
	});

	describe('handlePersonClick', () => {
		it('opens the person-editor modal with the person', () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.handlePersonClick(mockPerson);
			expect(modals.isOpen('person-editor')).toBe(true);
			const payload = modals.payload<{ person: Personnel }>('person-editor');
			expect(payload?.person.id).toBe('p-1');
		});
	});

	describe('isExempt', () => {
		it('returns true when person is in exemptPersonnelIds', () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			expect(ctx.isExempt(mockPerson, mockType)).toBe(true);
		});

		it('returns false when person is not exempt', () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			expect(ctx.isExempt(mockPerson2, mockType)).toBe(false);
		});

		it('returns false when type cannot be exempted', () => {
			const nonExemptType = { ...mockType, canBeExempted: false };
			const ctx = makeContext(makeData(), modals, makeOrg());
			expect(ctx.isExempt(mockPerson, nonExemptType)).toBe(false);
		});
	});

	describe('saved views', () => {
		const stored = {
			id: 'view-1',
			name: 'Annual',
			columnIds: ['t-1'],
			createdBy: 'user-1',
			createdAt: '2026-05-10T00:00:00.000Z',
			updatedAt: '2026-05-10T00:00:00.000Z'
		};

		it('applies a newly created view to the matrix and remembers the choice', async () => {
			const created = { ...stored, id: 'view-new', name: 'Range', columnIds: ['t-2', 't-1'] };
			const bodies: unknown[] = [];
			vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
				bodies.push(JSON.parse(init.body as string));
				return Response.json(created);
			});
			const ctx = makeContext(makeData(), modals, makeOrg());

			const result = await ctx.saveView({ id: null, name: 'Range', columnIds: ['t-2', 't-1'] });

			expect(result).toEqual(created);
			expect(bodies).toMatchObject([{ name: 'Range', columnIds: ['t-2', 't-1'] }]);
			expect(ctx.selectedViewId).toBe('view-new');
			expect(savePreferencesMock).toHaveBeenCalledWith({ training: { selectedViewId: 'view-new' } });
		});

		it('applies an edited view and keeps its identity', async () => {
			trainingViewsStore.load([stored], 'org-1');
			const edited = { ...stored, name: 'Yearly', columnIds: ['t-2', 't-1'] };
			vi.stubGlobal('fetch', async () => Response.json(edited));
			const ctx = makeContext(makeData(), modals, makeOrg());

			const result = await ctx.saveView({ id: 'view-1', name: 'Yearly', columnIds: ['t-2', 't-1'] });

			expect(result).toEqual(edited);
			expect(trainingViewsStore.items).toEqual([edited]);
			expect(ctx.selectedViewId).toBe('view-1');
		});

		it('throws and applies nothing when the save is refused', async () => {
			vi.stubGlobal('fetch', async () => Response.json({ message: 'Internal server error' }, { status: 500 }));
			const ctx = makeContext(makeData(), modals, makeOrg());

			await expect(ctx.saveView({ id: null, name: 'Range', columnIds: [] })).rejects.toThrow();
			expect(ctx.selectedViewId).toBeNull();
			expect(trainingViewsStore.items).toEqual([]);
		});

		it('leaves the selection alone when the save resolves after the user left the Training page', async () => {
			let respond!: (response: Response) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValue(
					new Promise<Response>((resolve) => {
						respond = resolve;
					})
				)
			);
			const ctx = makeContext(makeData(), modals, makeOrg());
			const saving = ctx.saveView({ id: null, name: 'Range', columnIds: [] }).catch((error: unknown) => error);

			ctx.dispose();
			respond(Response.json({ ...stored, id: 'view-late' }));

			expect(await saving).toBe('stale');
			expect(ctx.selectedViewId).toBeNull();
			expect(savePreferencesMock).not.toHaveBeenCalled();
		});

		it('clears the selection when the selected view is deleted', async () => {
			trainingViewsStore.load([stored], 'org-1');
			vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.setSelectedViewId('view-1');

			expect(await ctx.deleteView('view-1')).toBe('deleted');

			expect(trainingViewsStore.items).toEqual([]);
			expect(ctx.selectedViewId).toBeNull();
		});

		it('keeps the view and the selection when the delete fails', async () => {
			trainingViewsStore.load([stored], 'org-1');
			vi.stubGlobal('fetch', async () => Response.json({ message: 'Internal server error' }, { status: 500 }));
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.setSelectedViewId('view-1');

			expect(await ctx.deleteView('view-1')).toBe('failed');

			expect(trainingViewsStore.items).toEqual([stored]);
			expect(ctx.selectedViewId).toBe('view-1');
		});
	});
});

function rankCatalogEntry(overrides: Partial<RankCatalogEntry>): RankCatalogEntry {
	return {
		code: overrides.code ?? 'SGT',
		label: overrides.label ?? overrides.code ?? 'Sergeant',
		service: overrides.service ?? 'army',
		category: overrides.category ?? 'enlisted',
		payGrade: overrides.payGrade ?? 'E-5',
		state: overrides.state ?? 'active',
		sortOrder: overrides.sortOrder ?? 0
	};
}
