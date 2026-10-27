/**
 * `add` silently no-ops on empty strings or duplicate names (case-insensitive).
 * `rename` returns false for an empty name or a Group no longer loaded, and rejects a duplicate name.
 * `setOrder(ids)` saves a new order through one compare-and-replace command. Moves made while it is in flight fold into
 * one follow-up save; `add` and `deleteWithReassignment` wait for it to settle.
 */
import {
	buildRequestError,
	defineStore,
	rejectedRequestMessage,
	stillInOrganizationLifetime,
	withinOrganizationLifetime
} from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import {
	GROUP_CHANGE_UNCONFIRMED_MESSAGE,
	GROUP_NAME_EXISTS_MESSAGE,
	GROUP_ORDER_CHANGED_MESSAGE,
	type Group
} from '$features/personnel/contracts';
import { invalidate } from '$app/navigation';

export type GroupOrderChange = { status: 'saved' | 'stale' } | { status: 'failed'; message: string };

type OrderFlight = {
	readonly orgId: string;
	readonly inLifetime: () => boolean;
	readonly done: Promise<GroupOrderChange>;
};

interface GroupExtensions extends Record<string, unknown> {
	readonly pendingOrder: readonly string[] | null;
	add: (name: string) => Promise<Group | null>;
	rename: (id: string, newName: string) => Promise<boolean>;
	setOrder: (ids: readonly string[]) => Promise<GroupOrderChange>;
	deleteWithReassignment: (id: string, moveMembersTo: string | null) => Promise<number>;
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((id, index) => id === b[index]);

function isGroupList(value: unknown): value is Group[] {
	return (
		Array.isArray(value) &&
		value.every(
			(group) =>
				group && typeof group.id === 'string' && typeof group.name === 'string' && Number.isInteger(group.sortOrder)
		)
	);
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
		let expected: readonly string[] = base.items.map((group) => group.id);
		try {
			for (;;) {
				const sent = desired;
				let res: Response;
				try {
					res = await withinOrganizationLifetime(
						fetch(`/org/${owner.orgId}/api/groups/order`, {
							method: 'PUT',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ groupIds: sent, expectedGroupIds: expected })
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

	return {
		get pendingOrder() {
			return currentFlight() ? desired : null;
		},

		async add(name: string): Promise<Group | null> {
			const trimmed = name.trim();
			if (!trimmed) return null;
			await settleOrder();
			if (base.find((g) => g.name.toLowerCase() === trimmed.toLowerCase())) return null;
			const nextSortOrder = Math.max(-1, ...base.rawItems.map((group) => group.sortOrder)) + 1;
			return base.add({ name: trimmed, sortOrder: nextSortOrder } as Omit<Group, 'id'>);
		},

		async rename(id: string, newName: string): Promise<boolean> {
			const trimmed = newName.trim();
			if (!trimmed) return false;
			if (base.find((group) => group.id !== id && group.name.toLowerCase() === trimmed.toLowerCase()))
				throw new Error(GROUP_NAME_EXISTS_MESSAGE);
			return base.updateOrThrow(id, { name: trimmed });
		},

		setOrder(ids: readonly string[]): Promise<GroupOrderChange> {
			const current = currentFlight();
			desired = [...ids];
			if (current) return current.done;
			const done = Promise.withResolvers<GroupOrderChange>();
			const owner: OrderFlight = { orgId: base.orgId, inLifetime: stillInOrganizationLifetime(), done: done.promise };
			flight = owner;
			done.resolve(run(owner));
			return owner.done;
		},

		async deleteWithReassignment(id: string, moveMembersTo: string | null): Promise<number> {
			await settleOrder();
			const orgId = base.orgId;
			const resource = `/org/${orgId}/api/groups`;
			let res: Response;
			try {
				res = await internals.withinOrganization(
					fetch(resource, {
						method: 'DELETE',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ id, moveMembersTo })
					})
				);
			} catch {
				throw new Error(GROUP_CHANGE_UNCONFIRMED_MESSAGE);
			}
			if (!res.ok) {
				const failure = await internals.withinOrganization(buildRequestError(res, 'DELETE', 'groups'));
				throw new Error(rejectedRequestMessage(failure, GROUP_CHANGE_UNCONFIRMED_MESSAGE));
			}
			const body: unknown = await internals.withinOrganization(res.json()).catch(() => null);
			const movedCount = (body as { movedCount?: unknown } | null)?.movedCount;
			internals.commit({ deleted: [id] });
			return Number.isInteger(movedCount) ? (movedCount as number) : 0;
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
