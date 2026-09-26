/**
 * Pinned groups store — the ordered list this user has pinned in the active Organization.
 *
 * All mutations (pin, unpin, reorder) are optimistic: the UI updates instantly and rolls
 * back on API failure. A `#pendingMutations` counter prevents same-Organization hydration
 * from overwriting in-flight client changes. An Organization version isolates late responses.
 *
 * Persisted server-side per user (see `pinnedGroupOperations.server.ts`). Workspace hydration supplies
 * each Organization snapshot.
 */
export class PinnedGroupsStore {
	#pinnedGroups = $state.raw<string[]>([]);
	#orgId = '';
	#pendingMutations = 0;
	#organizationVersion = 0;

	get list() {
		return this.#pinnedGroups;
	}

	get orgId() {
		return this.#orgId;
	}

	load(pinnedGroups: string[], orgId: string) {
		if (orgId !== this.#orgId) {
			this.#organizationVersion++;
			this.#pendingMutations = 0;
		} else if (this.#pendingMutations > 0) return;
		this.#pinnedGroups = pinnedGroups;
		this.#orgId = orgId;
	}

	isPinned(group: string): boolean {
		return this.#pinnedGroups.includes(group);
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

		const mutationVersion = this.#organizationVersion;
		const orgId = this.#orgId;
		this.#pendingMutations++;
		// Optimistic: add immediately
		this.#pinnedGroups = [...this.#pinnedGroups, group];

		try {
			const res = await fetch(`/org/${orgId}/api/pinned-groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupName: group, sortOrder: this.#pinnedGroups.length - 1 })
			});
			if (!res.ok) throw new Error('Failed to pin group');
			return mutationVersion === this.#organizationVersion;
		} catch {
			// Rollback on failure
			if (mutationVersion === this.#organizationVersion)
				this.#pinnedGroups = this.#pinnedGroups.filter((g) => g !== group);
			return false;
		} finally {
			if (mutationVersion === this.#organizationVersion) this.#pendingMutations--;
		}
	}

	async unpin(group: string): Promise<boolean> {
		const mutationVersion = this.#organizationVersion;
		const orgId = this.#orgId;
		this.#pendingMutations++;
		// Optimistic: remove immediately
		const originalIndex = this.#pinnedGroups.indexOf(group);
		this.#pinnedGroups = this.#pinnedGroups.filter((g) => g !== group);

		try {
			const res = await fetch(`/org/${orgId}/api/pinned-groups`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupName: group })
			});
			if (!res.ok) throw new Error('Failed to unpin group');
			return mutationVersion === this.#organizationVersion;
		} catch {
			// Rollback on failure
			if (mutationVersion === this.#organizationVersion && originalIndex >= 0 && !this.#pinnedGroups.includes(group)) {
				const restored = [...this.#pinnedGroups];
				restored.splice(Math.min(originalIndex, restored.length), 0, group);
				this.#pinnedGroups = restored;
			}
			return false;
		} finally {
			if (mutationVersion === this.#organizationVersion) this.#pendingMutations--;
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
		const mutationVersion = this.#organizationVersion;
		const orgId = this.#orgId;
		this.#pendingMutations++;
		// Optimistic: reorder immediately
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
			return mutationVersion === this.#organizationVersion;
		} catch {
			// Rollback on failure
			if (mutationVersion === this.#organizationVersion) this.#rollbackSwap(group, precedingGroup);
			return false;
		} finally {
			if (mutationVersion === this.#organizationVersion) this.#pendingMutations--;
		}
	}

	async moveDown(group: string): Promise<boolean> {
		const index = this.#pinnedGroups.indexOf(group);
		if (index < 0 || index >= this.#pinnedGroups.length - 1) return false;

		const followingGroup = this.#pinnedGroups[index + 1];
		const mutationVersion = this.#organizationVersion;
		const orgId = this.#orgId;
		this.#pendingMutations++;
		// Optimistic: reorder immediately
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
			return mutationVersion === this.#organizationVersion;
		} catch {
			// Rollback on failure
			if (mutationVersion === this.#organizationVersion) this.#rollbackSwap(followingGroup, group);
			return false;
		} finally {
			if (mutationVersion === this.#organizationVersion) this.#pendingMutations--;
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

/** Workspace bootstraps supply the ordered pin snapshot without another request. */
export const pinnedGroupsHydration = {
	get orgId() {
		return pinnedGroupManagementStore.orgId;
	},
	load(names: string[], orgId: string) {
		pinnedGroupManagementStore.load(names, orgId);
	}
};
