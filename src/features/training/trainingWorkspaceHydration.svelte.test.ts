import { beforeEach, describe, expect, it } from 'vitest';
import type { RankCatalogEntry } from '$features/personnel/contracts';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType, TrainingView } from './training.types';
import { createTrainingWorkspaceHydrator } from './trainingWorkspaceHydration.svelte';
import type { TrainingWorkspaceHydration, TrainingWorkspaceReadiness } from './contracts';
import { trainingReadinessHydration } from './webSources.svelte';
import { TrainingPageContext } from './contexts/TrainingPageContext.svelte';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

function pageContext(orgId: string) {
	return new TrainingPageContext(
		{ orgId, orgName: 'Test Company' },
		new ModalRegistry(),
		{ orgId, ...createClientAccess({ membershipRole: 'member', capabilityMap: createCapabilityMap('view') }) },
		async () => false,
		() => undefined
	);
}

function readinessWorkspace(
	orgId: string,
	items: TrainingWorkspaceReadiness | Promise<TrainingWorkspaceReadiness>,
	snapshotKey = 'readiness:1'
): TrainingWorkspaceHydration {
	return {
		orgId,
		personnel: { mode: 'replace', snapshotKey: 'people', items: [] },
		groups: { mode: 'replace', snapshotKey: 'groups', items: [] },
		trainingTypes: { mode: 'replace', snapshotKey: 'types', items: [] },
		trainingViews: { mode: 'replace', snapshotKey: 'views', items: [] },
		personnelTrainings: { mode: 'replace', snapshotKey: 'records', items: [] },
		pinnedGroups: { mode: 'replace', snapshotKey: 'pins', items: [] },
		readiness: { mode: 'replace', snapshotKey, items }
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function createLoadable<T>() {
	let orgId = '';
	let items: T[] = [];
	let loading = false;
	return {
		get orgId() {
			return orgId;
		},
		get items() {
			return items;
		},
		get loading() {
			return loading;
		},
		loadCount: 0,
		load(nextItems: T[], nextOrgId: string) {
			items = nextItems;
			orgId = nextOrgId;
			loading = false;
			this.loadCount += 1;
		},
		startLoading() {
			loading = true;
		}
	};
}

function createStores() {
	return {
		personnelStore: createLoadable<Personnel>(),
		groupsStore: createLoadable<Group>(),
		trainingTypesStore: createLoadable<TrainingType>(),
		trainingViewsStore: createLoadable<TrainingView>(),
		personnelTrainingsStore: createLoadable<PersonnelTraining>(),
		pinnedGroupsStore: createLoadable<string>(),
		rankCatalogStore: createLoadable<RankCatalogEntry>()
	};
}

describe('Training workspace hydration adapter', () => {
	beforeEach(() => trainingReadinessHydration.clear());

	it('exposes the streamed Organization goal and day through the page context', async () => {
		const ctx = pageContext('org-1');
		const readiness = deferred<TrainingWorkspaceReadiness>();
		const pending = createTrainingWorkspaceHydrator().hydrate(
			readinessWorkspace('org-1', readiness.promise),
			createStores()
		);
		readiness.resolve({ readinessGoalPercent: 85, readinessAsOf: '2026-10-14' });
		await pending;

		expect({ goal: ctx.readinessGoalPercent, asOf: ctx.readinessAsOf }).toEqual({ goal: 85, asOf: '2026-10-14' });
	});

	it('ignores a delayed goal after the user switches Organizations', async () => {
		const hydrator = createTrainingWorkspaceHydrator();
		const stores = createStores();
		const old = deferred<TrainingWorkspaceReadiness>();
		const pending = hydrator.hydrate(readinessWorkspace('org-old', old.promise), stores);
		await hydrator.hydrate(
			readinessWorkspace('org-new', { readinessGoalPercent: 75, readinessAsOf: '2026-10-15' }),
			stores
		);
		old.resolve({ readinessGoalPercent: 95, readinessAsOf: '2026-10-14' });
		await pending;

		const current = pageContext('org-new');
		const previous = pageContext('org-old');
		expect({ goal: current.readinessGoalPercent, asOf: current.readinessAsOf }).toEqual({
			goal: 75,
			asOf: '2026-10-15'
		});
		expect({ goal: previous.readinessGoalPercent, asOf: previous.readinessAsOf }).toEqual({ goal: 90, asOf: '' });
	});

	it('keeps a newer goal refresh when an older request finishes later', async () => {
		const hydrator = createTrainingWorkspaceHydrator();
		const stores = createStores();
		const old = deferred<TrainingWorkspaceReadiness>();
		const pending = hydrator.hydrate(readinessWorkspace('org-1', old.promise, 'old'), stores);
		await hydrator.hydrate(
			readinessWorkspace('org-1', { readinessGoalPercent: 75, readinessAsOf: '2026-10-15' }, 'new'),
			stores
		);
		old.resolve({ readinessGoalPercent: 95, readinessAsOf: '2026-10-14' });
		await pending;

		const ctx = pageContext('org-1');
		expect({ goal: ctx.readinessGoalPercent, asOf: ctx.readinessAsOf }).toEqual({ goal: 75, asOf: '2026-10-15' });
	});

	it('clears readiness on access denial and prevents a pending goal from restoring it', async () => {
		const hydrator = createTrainingWorkspaceHydrator();
		const stores = createStores();
		await hydrator.hydrate(
			readinessWorkspace('org-1', { readinessGoalPercent: 75, readinessAsOf: '2026-10-15' }),
			stores
		);
		const later = deferred<TrainingWorkspaceReadiness>();
		const pending = hydrator.hydrate(readinessWorkspace('org-1', later.promise, 'later'), stores);
		hydrator.restrict(stores);
		later.resolve({ readinessGoalPercent: 95, readinessAsOf: '2026-10-16' });
		await pending;

		const ctx = pageContext('org-1');
		expect({ goal: ctx.readinessGoalPercent, asOf: ctx.readinessAsOf }).toEqual({ goal: 90, asOf: '' });
	});

	it('propagates a failed readiness source to the workspace load error', async () => {
		const readiness = deferred<TrainingWorkspaceReadiness>();
		const pending = createTrainingWorkspaceHydrator().hydrate(
			readinessWorkspace('org-1', readiness.promise),
			createStores()
		);
		readiness.reject(new Error('Organization settings unavailable'));
		await expect(pending).rejects.toThrow('Organization settings unavailable');
	});

	it('hydrates explicit Training workspace targets through the adapter interface', async () => {
		const stores = createStores();
		const trainingType = { id: 'tt1', name: 'CPR' } as TrainingType;
		const personnelTraining = { id: 'pt1', personnelId: 'p1', trainingTypeId: 'tt1' } as PersonnelTraining;
		const personnel = { id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel;
		const group = { id: 'g1', name: 'Alpha', sortOrder: 0 } as Group;
		const trainingView = {
			id: 'tv1',
			name: 'All',
			columnIds: [],
			createdBy: 'user-1',
			createdAt: '2024-01-01',
			updatedAt: '2024-01-01'
		} as TrainingView;
		const deferredTrainings = deferred<PersonnelTraining[]>();
		const hydration: TrainingWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [personnel] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [group] },
			trainingTypes: { mode: 'replace', snapshotKey: 'types:1', items: [trainingType] },
			trainingViews: { mode: 'replace', snapshotKey: 'views:1', items: [trainingView] },
			personnelTrainings: {
				mode: 'replace',
				deferred: true,
				snapshotKey: 'personnel-trainings:1',
				items: deferredTrainings.promise
			},
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: ['Alpha'] }
		};

		const pending = createTrainingWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.trainingTypesStore.items).toEqual([trainingType]);
		expect(stores.personnelTrainingsStore.loading).toBe(true);

		deferredTrainings.resolve([personnelTraining]);
		await pending;

		expect(stores.personnelStore.items).toEqual([personnel]);
		expect(stores.groupsStore.items).toEqual([group]);
		expect(stores.trainingViewsStore.items).toEqual([trainingView]);
		expect(stores.personnelTrainingsStore.items).toEqual([personnelTraining]);
		expect(stores.pinnedGroupsStore.items).toEqual(['Alpha']);
		expect(stores.personnelTrainingsStore.orgId).toBe('org-1');
		expect(stores.personnelTrainingsStore.loading).toBe(false);
	});

	it('hydrates deferred Training targets for a new org while the store still holds a previous org', async () => {
		const stores = createStores();
		const hydrator = createTrainingWorkspaceHydrator();
		const groups = deferred<Group[]>();
		const previousGroup = { id: 'previous-group', name: 'Previous', sortOrder: 0 } as Group;
		const freshGroup = { id: 'fresh-group', name: 'Fresh', sortOrder: 1 } as Group;
		stores.groupsStore.load([previousGroup], 'org-old');
		const hydration: TrainingWorkspaceHydration = {
			orgId: 'org-new',
			personnel: { mode: 'replace', snapshotKey: 'new-personnel', items: [] },
			groups: { mode: 'replace', deferred: true, snapshotKey: 'new-groups', items: groups.promise },
			trainingTypes: { mode: 'replace', snapshotKey: 'new-types', items: [] },
			trainingViews: { mode: 'replace', snapshotKey: 'new-views', items: [] },
			personnelTrainings: { mode: 'replace', snapshotKey: 'new-trainings', items: [] },
			pinnedGroups: { mode: 'replace', snapshotKey: 'new-pinned', items: [] }
		};

		const pending = hydrator.hydrate(hydration, stores);
		groups.resolve([freshGroup]);
		await pending;

		expect(stores.groupsStore.orgId).toBe('org-new');
		expect(stores.groupsStore.items).toEqual([freshGroup]);
	});

	it('hydrates a deferred Organization rank catalog for Training consumers', async () => {
		const stores = createStores();
		const rankCatalog = deferred<RankCatalogEntry[]>();
		const catalogEntry = rankCatalogEntry({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy' });
		const hydration: TrainingWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:rank-catalog', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:rank-catalog', items: [] },
			trainingTypes: { mode: 'replace', snapshotKey: 'types:rank-catalog', items: [] },
			trainingViews: { mode: 'replace', snapshotKey: 'views:rank-catalog', items: [] },
			personnelTrainings: { mode: 'replace', snapshotKey: 'trainings:rank-catalog', items: [] },
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:rank-catalog', items: [] },
			rankCatalog: {
				mode: 'replace',
				deferred: true,
				snapshotKey: 'rank-catalog:1',
				items: rankCatalog.promise
			}
		};

		const pending = createTrainingWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.rankCatalogStore.loading).toBe(true);

		rankCatalog.resolve([catalogEntry]);
		await pending;

		expect(stores.rankCatalogStore.items).toEqual([catalogEntry]);
		expect(stores.rankCatalogStore.orgId).toBe('org-1');
		expect(stores.rankCatalogStore.loading).toBe(false);
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
