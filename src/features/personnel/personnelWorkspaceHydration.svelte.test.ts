import { describe, expect, it, vi } from 'vitest';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel, StatusType } from '$lib/types';
import { createPersonnelWorkspaceHydrator, type PersonnelHydrationStores } from './personnelWorkspaceHydration.svelte';
import type { PersonnelWorkspaceHydration } from './server/personnelWorkspaceBootstrap';

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

function createPinnedGroupsLoadable() {
	let orgId = '';
	let list: string[] = [];
	return {
		get orgId() {
			return orgId;
		},
		get list() {
			return list;
		},
		load(nextItems: string[], nextOrgId: string) {
			list = nextItems;
			orgId = nextOrgId;
		}
	};
}

function createStores() {
	return {
		personnelStore: createLoadable<Personnel>(),
		groupsStore: createLoadable<Group>(),
		statusTypesStore: createLoadable<StatusType>(),
		pinnedGroupsStore: createPinnedGroupsLoadable()
	} satisfies PersonnelHydrationStores;
}

describe('Personnel workspace hydration adapter', () => {
	it('hydrates explicit Personnel workspace targets through the adapter interface', async () => {
		const stores = createStores();
		const person = { id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel;
		const group = { id: 'g1', name: 'Alpha', sortOrder: 0 } as Group;
		const statusType = { id: 'st1', name: 'Leave' } as StatusType;
		const deferredPersonnel = deferred<Personnel[]>();
		const hydration: PersonnelWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', deferred: true, snapshotKey: 'personnel:1', items: deferredPersonnel.promise },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [group] },
			statusTypes: { mode: 'replace', snapshotKey: 'status:1', items: [statusType] },
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: ['Alpha'] }
		};

		const pending = createPersonnelWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.personnelStore.loading).toBe(true);
		expect(stores.groupsStore.items).toEqual([group]);
		expect(stores.pinnedGroupsStore.list).toEqual(['Alpha']);

		deferredPersonnel.resolve([person]);
		await pending;

		expect(stores.personnelStore.items).toEqual([person]);
		expect(stores.statusTypesStore.items).toEqual([statusType]);
		expect(stores.personnelStore.orgId).toBe('org-1');
		expect(stores.personnelStore.loading).toBe(false);
	});

	it('ignores stale deferred Personnel targets when a newer org hydration wins', async () => {
		const stores = createStores();
		const hydrator = createPersonnelWorkspaceHydrator();
		const stalePersonnel = deferred<Personnel[]>();
		const freshPerson = { id: 'fresh', firstName: 'Jane', lastName: 'Jones' } as Personnel;
		const staleHydration: PersonnelWorkspaceHydration = {
			orgId: 'org-old',
			personnel: { mode: 'replace', deferred: true, snapshotKey: 'old-personnel', items: stalePersonnel.promise },
			groups: { mode: 'replace', snapshotKey: 'old-groups', items: [] },
			statusTypes: { mode: 'replace', snapshotKey: 'old-status', items: [] },
			pinnedGroups: { mode: 'replace', snapshotKey: 'old-pinned', items: [] }
		};
		const freshHydration: PersonnelWorkspaceHydration = {
			...staleHydration,
			orgId: 'org-new',
			personnel: {
				mode: 'replace',
				snapshotKey: 'new-personnel',
				items: [freshPerson]
			}
		};

		const stalePending = hydrator.hydrate(staleHydration, stores);
		await hydrator.hydrate(freshHydration, stores);
		stalePersonnel.resolve([{ id: 'stale', firstName: 'Old', lastName: 'Record' } as Personnel]);
		await stalePending;

		expect(stores.personnelStore.orgId).toBe('org-new');
		expect(stores.personnelStore.items).toEqual([freshPerson]);
	});

	it('clears pending Personnel targets after rejection so a later hydration can apply', async () => {
		const stores = createStores();
		const hydrator = createPersonnelWorkspaceHydrator();
		const rejectedPersonnel = deferred<Personnel[]>();
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rejectedHydration: PersonnelWorkspaceHydration = {
			orgId: 'org-1',
			personnel: {
				mode: 'replace',
				deferred: true,
				snapshotKey: 'personnel:rejected',
				items: rejectedPersonnel.promise
			},
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			statusTypes: { mode: 'replace', snapshotKey: 'status:1', items: [] },
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: [] }
		};
		const freshPerson = { id: 'fresh', firstName: 'Jane', lastName: 'Jones' } as Personnel;

		const pending = hydrator.hydrate(rejectedHydration, stores);
		rejectedPersonnel.reject(new Error('personnel load failed'));

		await expect(pending).rejects.toThrow('personnel load failed');
		consoleError.mockRestore();
		await hydrator.hydrate(
			{
				...rejectedHydration,
				personnel: { mode: 'replace', snapshotKey: 'personnel:fresh', items: [freshPerson] }
			},
			stores
		);

		expect(stores.personnelStore.items).toEqual([freshPerson]);
		expect(stores.personnelStore.orgId).toBe('org-1');
	});

	it('leaves stores untouched for explicit preserve-client hydration targets', async () => {
		const stores = createStores();
		const existingPerson = { id: 'existing', firstName: 'Existing', lastName: 'Soldier' } as Personnel;
		const incomingPerson = { id: 'incoming', firstName: 'Incoming', lastName: 'Soldier' } as Personnel;
		const existingGroup = { id: 'g-existing', name: 'Existing Group', sortOrder: 0 } as Group;
		const incomingGroup = { id: 'g-incoming', name: 'Incoming Group', sortOrder: 1 } as Group;
		stores.personnelStore.load([existingPerson], 'org-1');
		stores.groupsStore.load([existingGroup], 'org-1');
		stores.pinnedGroupsStore.load(['Existing Group'], 'org-1');

		await createPersonnelWorkspaceHydrator().hydrate(
			{
				orgId: 'org-1',
				personnel: { mode: 'preserve-client', snapshotKey: 'personnel:incoming', items: [incomingPerson] },
				groups: { mode: 'preserve-client', snapshotKey: 'groups:incoming', items: [incomingGroup] },
				statusTypes: { mode: 'preserve-client', snapshotKey: 'status:incoming', items: [] },
				pinnedGroups: { mode: 'preserve-client', snapshotKey: 'pinned:incoming', items: ['Incoming Group'] }
			},
			stores
		);

		expect(stores.personnelStore.items).toEqual([existingPerson]);
		expect(stores.groupsStore.items).toEqual([existingGroup]);
		expect(stores.pinnedGroupsStore.list).toEqual(['Existing Group']);
		expect(stores.personnelStore.loadCount).toBe(1);
		expect(stores.groupsStore.loadCount).toBe(1);
	});
});
