/**
 * All mutations (pin, unpin, reorder) are optimistic: the UI updates instantly and rolls
 * back on API failure, and a failed pin or unpin says so. A `#pendingMutations` counter prevents same-Organization hydration
 * from overwriting in-flight client changes. A response from another Organization or a shell lifetime the user has left
 * changes nothing and says nothing.
 */
import { organizationLifetime, stillInOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';

const PIN_FAILURE_MESSAGE = 'Failed to update pinned Groups. Try again.';

export class PinnedGroupsStore {
	#pinnedGroups = $state.raw<string[]>([]);
	#orgId = '';
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

	/** Mirrors a saved rename or delete, which already moved or removed every viewer's pin on the server. */
	followCatalogChange(from: string, to: string | null) {
		if (!this.#pinnedGroups.includes(from)) return;
		this.#pinnedGroups = this.#pinnedGroups.flatMap((name) => (name === to ? [] : name === from ? (to ?? []) : [name]));
	}

	isPinned(group: string): boolean {
		return this.#pinnedGroups.includes(group);
	}

	#mutationScope(): () => boolean {
		const version = this.#organizationVersion;
		const sameLifetime = stillInOrganizationLifetime();
		return () => sameLifetime() && version === this.#organizationVersion;
	}

	#rollbackSwap(left: string, right: string) {
		const index = this.#pinnedGroups.indexOf(left);
		if (index < 0 || this.#pinnedGroups[index + 1] !== right) return;
		const restored = [...this.#pinnedGroups];
		[restored[index], restored[index + 1]] = [restored[index + 1], restored[index]];
		this.#pinnedGroups = restored;
	}

	async pin(group: string): Promise<boolean> {
		if (this.#pinnedGroups.includes(group)) return true;

		const current = this.#mutationScope();
		const orgId = this.#orgId;
		this.#pendingMutations++;
		this.#pinnedGroups = [...this.#pinnedGroups, group];

		try {
			const res = await fetch(`/org/${orgId}/api/pinned-groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupName: group, sortOrder: this.#pinnedGroups.length - 1 })
			});
			if (!res.ok) throw new Error('Failed to pin group');
			return current();
		} catch {
			if (current()) {
				this.#pinnedGroups = this.#pinnedGroups.filter((g) => g !== group);
				toastStore.error(PIN_FAILURE_MESSAGE);
			}
			return false;
		} finally {
			if (current()) this.#pendingMutations--;
		}
	}

	async unpin(group: string): Promise<boolean> {
		const current = this.#mutationScope();
		const orgId = this.#orgId;
		this.#pendingMutations++;
		const originalIndex = this.#pinnedGroups.indexOf(group);
		this.#pinnedGroups = this.#pinnedGroups.filter((g) => g !== group);

		try {
			const res = await fetch(`/org/${orgId}/api/pinned-groups`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupName: group })
			});
			if (!res.ok) throw new Error('Failed to unpin group');
			return current();
		} catch {
			if (current() && originalIndex >= 0 && !this.#pinnedGroups.includes(group)) {
				const restored = [...this.#pinnedGroups];
				restored.splice(Math.min(originalIndex, restored.length), 0, group);
				this.#pinnedGroups = restored;
			}
			if (current()) toastStore.error(PIN_FAILURE_MESSAGE);
			return false;
		} finally {
			if (current()) this.#pendingMutations--;
		}
	}

	async toggle(group: string): Promise<boolean> {
		if (this.isPinned(group)) {
			return this.unpin(group);
		} else {
			return this.pin(group);
		}
	}

	async moveUp(group: string): Promise<boolean> {
		const index = this.#pinnedGroups.indexOf(group);
		if (index <= 0) return false;

		const precedingGroup = this.#pinnedGroups[index - 1];
		const current = this.#mutationScope();
		const orgId = this.#orgId;
		this.#pendingMutations++;
		const newList = [...this.#pinnedGroups];
		[newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
		this.#pinnedGroups = newList;

		try {
			const res = await fetch(`/org/${orgId}/api/pinned-groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'replace', groups: newList })
			});
			if (!res.ok) throw new Error('Failed to reorder pinned groups');
			return current();
		} catch {
			if (current()) this.#rollbackSwap(group, precedingGroup);
			return false;
		} finally {
			if (current()) this.#pendingMutations--;
		}
	}

	async moveDown(group: string): Promise<boolean> {
		const index = this.#pinnedGroups.indexOf(group);
		if (index < 0 || index >= this.#pinnedGroups.length - 1) return false;

		const followingGroup = this.#pinnedGroups[index + 1];
		const current = this.#mutationScope();
		const orgId = this.#orgId;
		this.#pendingMutations++;
		const newList = [...this.#pinnedGroups];
		[newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
		this.#pinnedGroups = newList;

		try {
			const res = await fetch(`/org/${orgId}/api/pinned-groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'replace', groups: newList })
			});
			if (!res.ok) throw new Error('Failed to reorder pinned groups');
			return current();
		} catch {
			if (current()) this.#rollbackSwap(followingGroup, group);
			return false;
		} finally {
			if (current()) this.#pendingMutations--;
		}
	}
}

const pinnedGroupManagementStore = new PinnedGroupsStore();

/** Other feature lanes can read pins and use the Personnel-owned toggle. */
export const pinnedGroupsStore = {
	get list() {
		return pinnedGroupManagementStore.list;
	},
	toggle(group: string) {
		return pinnedGroupManagementStore.toggle(group);
	}
};

/** The Group editor mirrors a saved rename (`to` is the new name) or delete (`to` is null). */
export function followPinnedGroupCatalogChange(from: string, to: string | null) {
	pinnedGroupManagementStore.followCatalogChange(from, to);
}

/** Workspace bootstraps supply the ordered pin snapshot without another request. */
export const pinnedGroupsHydration = {
	get loadVersion() {
		return pinnedGroupManagementStore.loadVersion;
	},
	get orgId() {
		return pinnedGroupManagementStore.orgId;
	},
	load(names: string[], orgId: string) {
		pinnedGroupManagementStore.load(names, orgId);
	}
};
