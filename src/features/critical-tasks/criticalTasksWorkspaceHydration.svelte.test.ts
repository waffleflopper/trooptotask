import { describe, expect, it } from 'vitest';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { IctTask, PersonnelIctCompletion } from './criticalTasks.types';
import {
	createCriticalTasksWorkspaceHydrator,
	type CriticalTasksHydrationStores
} from './criticalTasksWorkspaceHydration.svelte';
import type { CriticalTasksWorkspaceHydration } from './server/criticalTasksWorkspaceBootstrap';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
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
		ictTasksStore: createLoadable<IctTask>(),
		personnelIctCompletionsStore: createLoadable<PersonnelIctCompletion>()
	} satisfies CriticalTasksHydrationStores;
}

describe('Critical Tasks workspace hydration adapter', () => {
	it('hydrates explicit Critical Tasks workspace targets through the adapter interface', async () => {
		const stores = createStores();
		const personnel = { id: 'p1', firstName: 'Jane', lastName: 'Smith' } as Personnel;
		const group = { id: 'g1', name: 'Alpha', sortOrder: 0 } as Group;
		const ictTask = { id: 'task1', taskCode: '181-105-1001', title: 'Perform TCCC' } as IctTask;
		const deferredCompletions = deferred<PersonnelIctCompletion[]>();
		const completion = {
			id: 'completion1',
			personnelId: 'p1',
			ictTaskId: 'task1',
			completedAt: '2026-04-01'
		} as PersonnelIctCompletion;
		const hydration: CriticalTasksWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [personnel] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [group] },
			ictTasks: { mode: 'replace', snapshotKey: 'tasks:1', items: [ictTask] },
			personnelIctCompletions: {
				mode: 'replace',
				deferred: true,
				snapshotKey: 'completions:1',
				items: deferredCompletions.promise
			}
		};

		const pending = createCriticalTasksWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.personnelStore.items).toEqual([personnel]);
		expect(stores.groupsStore.items).toEqual([group]);
		expect(stores.ictTasksStore.items).toEqual([ictTask]);
		expect(stores.personnelIctCompletionsStore.loading).toBe(true);

		deferredCompletions.resolve([completion]);
		await pending;

		expect(stores.personnelIctCompletionsStore.items).toEqual([completion]);
		expect(stores.personnelIctCompletionsStore.orgId).toBe('org-1');
		expect(stores.personnelIctCompletionsStore.loading).toBe(false);
	});

	it('ignores stale deferred Critical Tasks targets when another org hydration wins', async () => {
		const stores = createStores();
		const hydrator = createCriticalTasksWorkspaceHydrator();
		const staleCompletions = deferred<PersonnelIctCompletion[]>();
		const freshCompletion = { id: 'fresh', personnelId: 'p2', ictTaskId: 'task1' } as PersonnelIctCompletion;
		const staleHydration: CriticalTasksWorkspaceHydration = {
			orgId: 'org-old',
			personnel: { mode: 'replace', snapshotKey: 'old-personnel', items: [] },
			groups: { mode: 'replace', snapshotKey: 'old-groups', items: [] },
			ictTasks: { mode: 'replace', snapshotKey: 'old-tasks', items: [] },
			personnelIctCompletions: {
				mode: 'replace',
				deferred: true,
				snapshotKey: 'old-completions',
				items: staleCompletions.promise
			}
		};
		const freshHydration: CriticalTasksWorkspaceHydration = {
			...staleHydration,
			orgId: 'org-new',
			personnelIctCompletions: {
				mode: 'replace',
				snapshotKey: 'new-completions',
				items: [freshCompletion]
			}
		};

		const stalePending = hydrator.hydrate(staleHydration, stores);
		await hydrator.hydrate(freshHydration, stores);
		staleCompletions.resolve([{ id: 'stale', personnelId: 'p1', ictTaskId: 'task1' } as PersonnelIctCompletion]);
		await stalePending;

		expect(stores.personnelIctCompletionsStore.orgId).toBe('org-new');
		expect(stores.personnelIctCompletionsStore.items).toEqual([freshCompletion]);
	});

	it('skips already-applied Critical Tasks snapshots until reset clears adapter state', async () => {
		const stores = createStores();
		const hydrator = createCriticalTasksWorkspaceHydrator();
		const ictTask = { id: 'task1', taskCode: '181-105-1001', title: 'Perform TCCC' } as IctTask;
		const hydration: CriticalTasksWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			ictTasks: { mode: 'replace', snapshotKey: 'tasks:1', items: [ictTask] },
			personnelIctCompletions: { mode: 'replace', snapshotKey: 'completions:1', items: [] }
		};

		await hydrator.hydrate(hydration, stores);
		await hydrator.hydrate(hydration, stores);
		expect(stores.ictTasksStore.loadCount).toBe(1);

		hydrator.reset();
		await hydrator.hydrate(hydration, stores);
		expect(stores.ictTasksStore.loadCount).toBe(2);
	});
});
