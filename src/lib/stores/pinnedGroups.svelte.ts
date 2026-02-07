class PinnedGroupsStore {
	#pinnedGroups = $state<string[]>([]);
	#clinicId = '';

	get list() {
		return this.#pinnedGroups;
	}

	load(pinnedGroups: string[], clinicId: string) {
		this.#pinnedGroups = pinnedGroups;
		this.#clinicId = clinicId;
	}

	isPinned(group: string): boolean {
		return this.#pinnedGroups.includes(group);
	}

	async pin(group: string): Promise<boolean> {
		if (this.#pinnedGroups.includes(group)) return true;

		const res = await fetch(`/clinic/${this.#clinicId}/api/pinned-groups`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ groupName: group, sortOrder: this.#pinnedGroups.length })
		});
		if (!res.ok) return false;
		this.#pinnedGroups = [...this.#pinnedGroups, group];
		return true;
	}

	async unpin(group: string): Promise<boolean> {
		const res = await fetch(`/clinic/${this.#clinicId}/api/pinned-groups`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ groupName: group })
		});
		if (!res.ok) return false;
		this.#pinnedGroups = this.#pinnedGroups.filter((g) => g !== group);
		return true;
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

		const newList = [...this.#pinnedGroups];
		[newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];

		const res = await fetch(`/clinic/${this.#clinicId}/api/pinned-groups`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'replace', groups: newList })
		});
		if (!res.ok) return false;
		this.#pinnedGroups = newList;
		return true;
	}

	async moveDown(group: string): Promise<boolean> {
		const index = this.#pinnedGroups.indexOf(group);
		if (index < 0 || index >= this.#pinnedGroups.length - 1) return false;

		const newList = [...this.#pinnedGroups];
		[newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];

		const res = await fetch(`/clinic/${this.#clinicId}/api/pinned-groups`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'replace', groups: newList })
		});
		if (!res.ok) return false;
		this.#pinnedGroups = newList;
		return true;
	}
}

export const pinnedGroupsStore = new PinnedGroupsStore();
