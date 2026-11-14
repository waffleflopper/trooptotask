import { describe, expect, it } from 'vitest';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import type { IctTask, PersonnelIctCompletion } from './criticalTasks.types';
import {
	createCriticalTasksWorkspaceHydrator,
	type CriticalTasksHydrationStores
} from './criticalTasksWorkspaceHydration.svelte';
import type { CriticalTasksWorkspaceHydration } from './contracts';
import { personnelIctCompletionsStore } from './stores/personnelIctCompletions.svelte';

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
		pinnedGroupsStore: createLoadable<string>(),
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
			pinnedGroups: { mode: 'replace', snapshotKey: 'pins:1', items: ['Alpha'] },
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
		expect(stores.pinnedGroupsStore.items).toEqual(['Alpha']);
		expect(stores.pinnedGroupsStore.orgId).toBe('org-1');
		expect(stores.ictTasksStore.items).toEqual([ictTask]);
		expect(stores.personnelIctCompletionsStore.loading).toBe(true);

		deferredCompletions.resolve([completion]);
		await pending;

		expect(stores.personnelIctCompletionsStore.items).toEqual([completion]);
		expect(stores.personnelIctCompletionsStore.orgId).toBe('org-1');
		expect(stores.personnelIctCompletionsStore.loading).toBe(false);
	});

	it('keeps the completions on screen while a refresh streams, and not when the same Organization loads afresh', async () => {
		const stores = createStores();
		const hydrator = createCriticalTasksWorkspaceHydrator();
		const shown = { id: 'completion1', personnelId: 'p1', ictTaskId: 'task1' } as PersonnelIctCompletion;
		const refreshed = { ...shown, id: 'completion2' };
		const hydrationWith = (
			orgId: string,
			snapshotKey: string,
			items: PersonnelIctCompletion[] | Promise<PersonnelIctCompletion[]>
		): CriticalTasksWorkspaceHydration => ({
			orgId,
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			pinnedGroups: { mode: 'replace', snapshotKey: 'pins:1', items: [] },
			ictTasks: { mode: 'replace', snapshotKey: 'tasks:1', items: [] },
			personnelIctCompletions: { mode: 'replace', deferred: true, snapshotKey, items }
		});
		await hydrator.hydrate(hydrationWith('org-1', 'completions:1', [shown]), stores);

		const refresh = deferred<PersonnelIctCompletion[]>();
		const pending = hydrator.hydrate(hydrationWith('org-1', 'completions:2', refresh.promise), stores, {
			keepRows: true
		});
		expect(stores.personnelIctCompletionsStore.loading).toBe(false);
		expect(stores.personnelIctCompletionsStore.items).toEqual([shown]);

		refresh.resolve([refreshed]);
		await pending;
		expect(stores.personnelIctCompletionsStore.items).toEqual([refreshed]);

		void hydrator.hydrate(hydrationWith('org-1', 'completions:3', new Promise(() => {})), stores);
		expect(stores.personnelIctCompletionsStore.loading).toBe(true);
	});

	it('keeps a completion saved while a refresh streams when the older snapshot lands', async () => {
		const stores = { ...createStores(), personnelIctCompletionsStore };
		const hydrator = createCriticalTasksWorkspaceHydrator();
		const shown = { id: 'completion1', personnelId: 'p1', ictTaskId: 'task1' } as PersonnelIctCompletion;
		const saved = { id: 'completion2', personnelId: 'p2', ictTaskId: 'task1' } as PersonnelIctCompletion;
		const hydrationWith = (
			snapshotKey: string,
			items: PersonnelIctCompletion[] | Promise<PersonnelIctCompletion[]>
		): CriticalTasksWorkspaceHydration => ({
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			pinnedGroups: { mode: 'replace', snapshotKey: 'pins:1', items: [] },
			ictTasks: { mode: 'replace', snapshotKey: 'tasks:1', items: [] },
			personnelIctCompletions: { mode: 'replace', deferred: true, snapshotKey, items }
		});
		await hydrator.hydrate(hydrationWith('completions:1', [shown]), stores);

		const refresh = deferred<PersonnelIctCompletion[]>();
		const pending = hydrator.hydrate(hydrationWith('completions:2', refresh.promise), stores, { keepRows: true });
		personnelIctCompletionsStore.mergeBatchResults([saved]);
		refresh.resolve([shown]);
		await pending;

		expect(personnelIctCompletionsStore.items.map((item) => item.id).sort()).toEqual(['completion1', 'completion2']);
		personnelIctCompletionsStore.load([], '');
	});
});
