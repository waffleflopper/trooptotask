/**
 * Pin and unpin are optimistic: the UI updates instantly and says so when the API fails. Pins hold Group ids.
 * `#saved` holds the pins the server has confirmed. Each Group's requests go out one at a time, and once the last one
 * settles the list shows that Group exactly as saved, so a failure never has to guess what to roll back to.
 * A `#pendingMutations` counter prevents same-Organization hydration from overwriting in-flight client changes. A response from another Organization or a shell lifetime the user has left
 * changes nothing and says nothing.
 */
import { organizationLifetime, stillInOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';

const PIN_FAILURE_MESSAGE = 'Failed to update pinned Groups. Try again.';

interface GroupRequests {
	queue: Promise<unknown>;
	pending: number;
	/** Advanced when the database drops the Group's pins, so a request sent before then cannot confirm one. */
	epoch: number;
}

export class PinnedGroupsStore {
	#pinnedGroups = $state.raw<string[]>([]);
	#saved: string[] = [];
	#requests = new Map<string, GroupRequests>();
	#orgId = $state('');
	#pendingMutations = 0;
	#organizationVersion = 0;
	#loadedLifetime = organizationLifetime();
	#loadVersion = 0;

	get list() {
		return this.#pinnedGroups;
	}

	get loadVersion() {
		return this.#loadVersion;
	}

	get orgId() {
		return this.#orgId;
	}

	load(pinnedGroups: string[], orgId: string) {
		if (orgId !== this.#orgId || this.#loadedLifetime !== organizationLifetime()) {
			this.#organizationVersion++;
			this.#pendingMutations = 0;
			this.#requests = new Map();
			this.#loadedLifetime = organizationLifetime();
		} else if (this.#pendingMutations > 0) return;
		this.#loadVersion++;
		this.#saved = pinnedGroups;
		this.#pinnedGroups = pinnedGroups;
		this.#orgId = orgId;
	}

	/** The database drops a deleted or moved-down Group's pins; this keeps the open page in step without a reload. */
	forgetGroup(groupId: string) {
		const requests = this.#requests.get(groupId);
		if (requests) requests.epoch++;
		this.#saved = this.#saved.filter((id) => id !== groupId);
		if (!this.#pinnedGroups.includes(groupId)) return;
		this.#pinnedGroups = this.#pinnedGroups.filter((id) => id !== groupId);
	}

	isPinned(groupId: string): boolean {
		return this.#pinnedGroups.includes(groupId);
	}

	#mutationScope(): () => boolean {
		const version = this.#organizationVersion;
		const sameLifetime = stillInOrganizationLifetime();
		return () => sameLifetime() && version === this.#organizationVersion;
	}

	/** Shows the Group as saved, at its saved position. */
	#showSaved(groupId: string) {
		const at = this.#saved.indexOf(groupId);
		if (this.#pinnedGroups.includes(groupId) === at >= 0) return;
		const shown = this.#pinnedGroups.filter((id) => id !== groupId);
		if (at >= 0) shown.splice(Math.min(at, shown.length), 0, groupId);
		this.#pinnedGroups = shown;
	}

	async #request(groupId: string, pinned: boolean): Promise<boolean> {
		const current = this.#mutationScope();
		const orgId = this.#orgId;
		const requests = this.#requests.get(groupId) ?? { queue: Promise.resolve(), pending: 0, epoch: 0 };
		this.#requests.set(groupId, requests);
		requests.pending++;
		this.#pendingMutations++;
		const others = this.#pinnedGroups.filter((id) => id !== groupId);
		this.#pinnedGroups = pinned ? [...others, groupId] : others;
		const sortOrder = this.#pinnedGroups.length - 1;

		const send = async () => {
			const epoch = requests.epoch;
			const res = await fetch(`/org/${orgId}/api/pinned-groups`, {
				method: pinned ? 'POST' : 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(pinned ? { groupId, sortOrder } : { groupId })
			});
			if (!res.ok) throw new Error(pinned ? 'Failed to pin group' : 'Failed to unpin group');
			return epoch;
		};
		const sent = requests.pending === 1 ? send() : requests.queue.then(send);
		requests.queue = sent.catch(() => undefined);

		try {
			const epoch = await sent;
			if (current() && epoch === requests.epoch) {
				const others = this.#saved.filter((id) => id !== groupId);
				this.#saved = pinned ? [...others, groupId] : others;
			}
			return current();
		} catch {
			if (current()) toastStore.error(PIN_FAILURE_MESSAGE);
			return false;
		} finally {
			if (current()) {
				this.#pendingMutations--;
				if (--requests.pending === 0) this.#showSaved(groupId);
			}
		}
	}

	pin(groupId: string): Promise<boolean> {
		if (this.#pinnedGroups.includes(groupId)) return Promise.resolve(true);
		return this.#request(groupId, true);
	}

	unpin(groupId: string): Promise<boolean> {
		return this.#request(groupId, false);
	}

	async toggle(groupId: string): Promise<boolean> {
		if (this.isPinned(groupId)) {
			return this.unpin(groupId);
		} else {
			return this.pin(groupId);
		}
	}
}

const pinnedGroupManagementStore = new PinnedGroupsStore();

/** Other feature lanes can read pins and use the Personnel-owned toggle. */
export const pinnedGroupsStore = {
	get list() {
		return pinnedGroupManagementStore.list;
	},
	get orgId() {
		return pinnedGroupManagementStore.orgId;
	},
	toggle(groupId: string) {
		return pinnedGroupManagementStore.toggle(groupId);
	}
};

export function forgetGroupPin(groupId: string) {
	pinnedGroupManagementStore.forgetGroup(groupId);
}

/** Workspace bootstraps supply the ordered pin snapshot without another request. */
export const pinnedGroupsHydration = {
	get loadVersion() {
		return pinnedGroupManagementStore.loadVersion;
	},
	get orgId() {
		return pinnedGroupManagementStore.orgId;
	},
	load(groupIds: string[], orgId: string) {
		pinnedGroupManagementStore.load(groupIds, orgId);
	}
};
