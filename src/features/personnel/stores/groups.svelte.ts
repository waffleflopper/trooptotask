/**
 * `add` silently no-ops on empty strings or a sibling's name (case-insensitive).
 * `rename` returns false for an empty name or a Group no longer loaded, and rejects a sibling's name.
 * `setOrder(ids, parentId)` saves one sibling set's order through one compare-and-replace command. Moves in the same
 * set made while it is in flight fold into one follow-up save; a move in another set waits for it. `add`, `move` and
 * `deleteWithReassignment` wait for it to settle.
 * `move` and `deleteWithReassignment` change a whole subtree, so they update every Group in it locally.
 */
import {
	buildRequestError,
	defineStore,
	rejectedRequestMessage,
	stillInOrganizationLifetime,
	withinOrganizationLifetime
} from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import { nextSortOrder } from '../groupStructure';
import {
	GROUP_CHANGE_UNCONFIRMED_MESSAGE,
	GROUP_NAME_EXISTS_MESSAGE,
	GROUP_ORDER_CHANGED_MESSAGE,
	GROUP_UNAVAILABLE_MESSAGE,
	type Group
} from '$features/personnel/contracts';
import { invalidate } from '$app/navigation';

export type GroupOrderChange = { status: 'saved' | 'stale' } | { status: 'failed'; message: string };

type OrderFlight = {
	readonly orgId: string;
	readonly parentId: string | null;
	readonly inLifetime: () => boolean;
	readonly done: Promise<GroupOrderChange>;
};

export interface PendingGroupOrder {
	readonly parentId: string | null;
	readonly ids: readonly string[];
}

export interface GroupDeleteResult {
	movedCount: number;
	/** The Group and every sub-group under it. */
	deletedIds: string[];
}

interface GroupExtensions extends Record<string, unknown> {
	readonly pendingOrder: PendingGroupOrder | null;
	add: (name: string, parentId?: string | null) => Promise<Group | null>;
	rename: (id: string, newName: string) => Promise<boolean>;
	move: (id: string, parentId: string | null) => Promise<Group>;
	setOrder: (ids: readonly string[], parentId?: string | null) => Promise<GroupOrderChange>;
	deleteWithReassignment: (id: string, moveMembersTo: string | null) => Promise<GroupDeleteResult>;
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((id, index) => id === b[index]);

function isGroup(value: unknown): value is Group {
	const group = value as Group | null;
	return !!group && typeof group.id === 'string' && typeof group.name === 'string' && Number.isInteger(group.sortOrder);
}

function isGroupList(value: unknown): value is Group[] {
	return Array.isArray(value) && value.every(isGroup);
}

function subtreeIds(groups: readonly Group[], id: string): string[] {
	const ids = [id];
	for (let index = 0; index < ids.length; index++) {
		for (const group of groups) if (group.parentId === ids[index]) ids.push(group.id);
	}
	return ids;
}

function enhance(base: Store<Group>, internals: StoreInternals<Group>): GroupExtensions {
	let flight = $state.raw<OrderFlight | null>(null);
	let desired = $state.raw<readonly string[]>([]);

	function currentFlight(): OrderFlight | null {
		return flight && flight.inLifetime() && flight.orgId === base.orgId ? flight : null;
	}

	async function settleOrder(): Promise<void> {
		await currentFlight()?.done;
	}

	async function adoptSaved(orgId: string, owns: () => boolean): Promise<void> {
		const loadVersion = base.loadVersion;
		try {
			const res = await withinOrganizationLifetime(fetch(`/org/${orgId}/api/groups`));
			if (!res.ok || !owns()) return;
			const saved: unknown = await withinOrganizationLifetime(res.json());
			if (isGroupList(saved) && owns() && base.loadVersion === loadVersion) base.load(saved, orgId);
		} catch {
			return;
		}
	}

	function applySavedOrder(sent: readonly string[]) {
		const position = new Map(sent.map((id, index) => [id, index]));
		base.updateLocalWhere(
			(group) => position.has(group.id) && group.sortOrder !== position.get(group.id),
			(group) => ({ ...group, sortOrder: position.get(group.id)! })
		);
	}

	async function run(owner: OrderFlight): Promise<GroupOrderChange> {
		const owns = () => currentFlight() === owner;
		let expected: readonly string[] = base.items
			.filter((group) => group.parentId === owner.parentId)
			.map((group) => group.id);
		try {
			for (;;) {
				const sent = desired;
				let res: Response;
				try {
					res = await withinOrganizationLifetime(
						fetch(`/org/${owner.orgId}/api/groups/order`, {
							method: 'PUT',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ groupIds: sent, expectedGroupIds: expected, parentId: owner.parentId })
						})
					);
				} catch {
					if (!owns()) return { status: 'stale' };
					await adoptSaved(owner.orgId, owns);
					return owns() ? { status: 'failed', message: GROUP_CHANGE_UNCONFIRMED_MESSAGE } : { status: 'stale' };
				}
				if (!owns()) return { status: 'stale' };
				if (!res.ok) {
					const failure = await withinOrganizationLifetime(buildRequestError(res, 'PUT', 'groups/order'));
					await adoptSaved(owner.orgId, owns);
					if (!owns()) return { status: 'stale' };
					if (res.status === 409) {
						await withinOrganizationLifetime(invalidate('app:personnel-data'), owns);
						if (!owns()) return { status: 'stale' };
					}
					const message =
						res.status === 409
							? GROUP_ORDER_CHANGED_MESSAGE
							: rejectedRequestMessage(failure, GROUP_CHANGE_UNCONFIRMED_MESSAGE);
					return { status: 'failed', message };
				}
				applySavedOrder(sent);
				if (sameIds(desired, sent)) return { status: 'saved' };
				expected = sent;
			}
		} finally {
			if (flight === owner) flight = null;
		}
	}

	function setOrder(ids: readonly string[], parentId: string | null = null): Promise<GroupOrderChange> {
		const current = currentFlight();
		if (current && current.parentId !== parentId) return current.done.then(() => setOrder(ids, parentId));
		desired = [...ids];
		if (current) return current.done;
		const done = Promise.withResolvers<GroupOrderChange>();
		const owner: OrderFlight = {
			orgId: base.orgId,
			parentId,
			inLifetime: stillInOrganizationLifetime(),
			done: done.promise
		};
		flight = owner;
		done.resolve(run(owner));
		return owner.done;
	}

	async function send(method: 'PATCH' | 'DELETE', body: unknown): Promise<unknown> {
		let res: Response;
		try {
			res = await internals.withinOrganization(
				fetch(`/org/${base.orgId}/api/groups`, {
					method,
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				})
			);
		} catch {
			throw new Error(GROUP_CHANGE_UNCONFIRMED_MESSAGE);
		}
		if (!res.ok) {
			const failure = await internals.withinOrganization(buildRequestError(res, method, 'groups'));
			throw new Error(rejectedRequestMessage(failure, GROUP_CHANGE_UNCONFIRMED_MESSAGE));
		}
		return internals.withinOrganization(res.json()).catch(() => null);
	}

	return {
		get pendingOrder() {
			const current = currentFlight();
			return current ? { parentId: current.parentId, ids: desired } : null;
		},

		async add(name: string, parentId: string | null = null): Promise<Group | null> {
			const trimmed = name.trim();
			if (!trimmed) return null;
			await settleOrder();
			const parent = parentId === null ? null : base.find((group) => group.id === parentId);
			if (parent === undefined) throw new Error(GROUP_UNAVAILABLE_MESSAGE);
			const siblings = base.rawItems.filter((group) => group.parentId === parentId);
			if (siblings.some((group) => group.name.toLowerCase() === trimmed.toLowerCase())) return null;
			const depth = (parent ? parent.depth + 1 : 1) as Group['depth'];
			return base.add({ name: trimmed, sortOrder: nextSortOrder(siblings, parentId), parentId, depth });
		},

		async rename(id: string, newName: string): Promise<boolean> {
			const trimmed = newName.trim();
			if (!trimmed) return false;
			const current = base.find((group) => group.id === id);
			if (!current) return false;
			if (
				base.find(
					(group) =>
						group.id !== id && group.parentId === current.parentId && group.name.toLowerCase() === trimmed.toLowerCase()
				)
			)
				throw new Error(GROUP_NAME_EXISTS_MESSAGE);
			return base.updateOrThrow(id, { name: trimmed });
		},

		setOrder,

		async move(id: string, parentId: string | null): Promise<Group> {
			await settleOrder();
			const moved = await send('PATCH', { id, parentId });
			if (!isGroup(moved)) throw new Error(GROUP_CHANGE_UNCONFIRMED_MESSAGE);
			const before = base.find((group) => group.id === id);
			const shift = before ? moved.depth - before.depth : 0;
			const below = new Set(subtreeIds(base.rawItems, id).slice(1));
			const descendants = base.rawItems
				.filter((group) => below.has(group.id))
				.map((group) => ({ ...group, depth: (group.depth + shift) as Group['depth'] }));
			internals.commit({ saved: [moved, ...descendants] });
			return moved;
		},

		async deleteWithReassignment(id: string, moveMembersTo: string | null): Promise<GroupDeleteResult> {
			await settleOrder();
			const deletedIds = subtreeIds(base.rawItems, id);
			const body = await send('DELETE', { id, moveMembersTo });
			const movedCount = (body as { movedCount?: unknown } | null)?.movedCount;
			internals.commit({ deleted: deletedIds });
			return { movedCount: Number.isInteger(movedCount) ? (movedCount as number) : 0, deletedIds };
		}
	};
}

export const groupManagementStore = defineStore<Group, GroupExtensions>(
	{ table: 'groups', orderBy: [{ field: 'sortOrder' }, { field: 'name' }, { field: 'id' }] },
	enhance
);

/** Other feature lanes can read the current Organization catalog without mutating it. */
export const groupsStore: Pick<Store<Group>, 'items' | 'orgId' | 'loading' | 'busy'> = {
	get items() {
		return groupManagementStore.items;
	},
	get orgId() {
		return groupManagementStore.orgId;
	},
	get loading() {
		return groupManagementStore.loading;
	},
	get busy() {
		return groupManagementStore.busy;
	}
};

/** Workspace bootstraps supply the catalog snapshot without another request. */
export const groupCatalogHydration = {
	get loadVersion() {
		return groupManagementStore.loadVersion;
	},
	get items() {
		return groupManagementStore.items;
	},
	get orgId() {
		return groupManagementStore.orgId;
	},
	load(items: Group[], orgId: string) {
		groupManagementStore.load(items, orgId);
	},
	startLoading() {
		groupManagementStore.startLoading();
	}
};
