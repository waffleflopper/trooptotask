class PinnedGroupsStore {
	#pinnedGroups = $state.raw<string[]>([]);
	#orgId = '';
	#pendingMutations = 0;

	get list() {
		return this.#pinnedGroups;
	}

	load(pinnedGroups: string[], orgId: string) {
		if (this.#pendingMutations > 0 && orgId === this.#orgId) return;
		this.#pinnedGroups = pinnedGroups;
		this.#orgId = orgId;
	}

	isPinned(group: string): boolean {
		return this.#pinnedGroups.includes(group);
	}

	async pin(group: string): Promise<boolean> {
		if (this.#pinnedGroups.includes(group)) return true;

		this.#pendingMutations++;
		// Optimistic: add immediately
		this.#pinnedGroups = [...this.#pinnedGroups, group];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/pinned-groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupName: group, sortOrder: this.#pinnedGroups.length - 1 })
			});
			if (!res.ok) throw new Error('Failed to pin group');
			return true;
		} catch {
			// Rollback on failure
			this.#pinnedGroups = this.#pinnedGroups.filter((g) => g !== group);
			return false;
		} finally {
			this.#pendingMutations--;
		}
	}

	async unpin(group: string): Promise<boolean> {
		this.#pendingMutations++;
		// Optimistic: remove immediately
		const originalList = [...this.#pinnedGroups];
		this.#pinnedGroups = this.#pinnedGroups.filter((g) => g !== group);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/pinned-groups`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupName: group })
			});
			if (!res.ok) throw new Error('Failed to unpin group');
			return true;
		} catch {
			// Rollback on failure
			this.#pinnedGroups = originalList;
			return false;
		} finally {
			this.#pendingMutations--;
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

		this.#pendingMutations++;
		// Optimistic: reorder immediately
		const originalList = [...this.#pinnedGroups];
		const newList = [...this.#pinnedGroups];
		[newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
		this.#pinnedGroups = newList;

		try {
			const res = await fetch(`/org/${this.#orgId}/api/pinned-groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'replace', groups: newList })
			});
			if (!res.ok) throw new Error('Failed to reorder pinned groups');
			return true;
		} catch {
			// Rollback on failure
			this.#pinnedGroups = originalList;
			return false;
		} finally {
			this.#pendingMutations--;
		}
	}

	async moveDown(group: string): Promise<boolean> {
		const index = this.#pinnedGroups.indexOf(group);
		if (index < 0 || index >= this.#pinnedGroups.length - 1) return false;

		this.#pendingMutations++;
		// Optimistic: reorder immediately
		const originalList = [...this.#pinnedGroups];
		const newList = [...this.#pinnedGroups];
		[newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
		this.#pinnedGroups = newList;

		try {
			const res = await fetch(`/org/${this.#orgId}/api/pinned-groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'replace', groups: newList })
			});
			if (!res.ok) throw new Error('Failed to reorder pinned groups');
			return true;
		} catch {
			// Rollback on failure
			this.#pinnedGroups = originalList;
			return false;
		} finally {
			this.#pendingMutations--;
		}
	}
}

export const pinnedGroupsStore = new PinnedGroupsStore();
