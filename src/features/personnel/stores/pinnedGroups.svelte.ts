/**
 * Pin and unpin are optimistic: the UI updates instantly, rolls back on API failure, and says so. Pins hold Group ids.
 * A `#pendingMutations` counter prevents same-Organization hydration from overwriting in-flight client changes. A response from another Organization or a shell lifetime the user has left
 * changes nothing and says nothing.
 */
import { organizationLifetime, stillInOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';

const PIN_FAILURE_MESSAGE = 'Failed to update pinned Groups. Try again.';

export class PinnedGroupsStore {
	#pinnedGroups = $state.raw<string[]>([]);
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
			this.#loadedLifetime = organizationLifetime();
		} else if (this.#pendingMutations > 0) return;
		this.#loadVersion++;
		this.#pinnedGroups = pinnedGroups;
		this.#orgId = orgId;
	}

	/** The database drops a deleted Group's pins; this keeps the open page in step without a reload. */
	forgetGroup(groupId: string) {
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

	async pin(groupId: string): Promise<boolean> {
		if (this.#pinnedGroups.includes(groupId)) return true;

		const current = this.#mutationScope();
		const orgId = this.#orgId;
		this.#pendingMutations++;
		this.#pinnedGroups = [...this.#pinnedGroups, groupId];

		try {
			const res = await fetch(`/org/${orgId}/api/pinned-groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupId, sortOrder: this.#pinnedGroups.length - 1 })
			});
			if (!res.ok) throw new Error('Failed to pin group');
			return current();
		} catch {
			if (current()) {
				this.#pinnedGroups = this.#pinnedGroups.filter((id) => id !== groupId);
				toastStore.error(PIN_FAILURE_MESSAGE);
			}
			return false;
		} finally {
			if (current()) this.#pendingMutations--;
		}
	}

	async unpin(groupId: string): Promise<boolean> {
		const current = this.#mutationScope();
		const orgId = this.#orgId;
		this.#pendingMutations++;
		const originalIndex = this.#pinnedGroups.indexOf(groupId);
		this.#pinnedGroups = this.#pinnedGroups.filter((id) => id !== groupId);

		try {
			const res = await fetch(`/org/${orgId}/api/pinned-groups`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupId })
			});
			if (!res.ok) throw new Error('Failed to unpin group');
			return current();
		} catch {
			if (current() && originalIndex >= 0 && !this.#pinnedGroups.includes(groupId)) {
				const restored = [...this.#pinnedGroups];
				restored.splice(Math.min(originalIndex, restored.length), 0, groupId);
				this.#pinnedGroups = restored;
			}
			if (current()) toastStore.error(PIN_FAILURE_MESSAGE);
			return false;
		} finally {
			if (current()) this.#pendingMutations--;
		}
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

export function forgetDeletedGroupPin(groupId: string) {
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
