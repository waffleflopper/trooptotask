export interface Group {
	id: string;
	name: string;
	sortOrder: number;
}

class GroupsStore {
	#groups = $state.raw<Group[]>([]);
	#orgId = '';

	get list() {
		return this.#groups;
	}

	get names() {
		return this.#groups.map((g) => g.name);
	}

	load(groups: Group[], orgId: string) {
		this.#groups = groups;
		this.#orgId = orgId;
	}

	async add(name: string): Promise<Group | null> {
		if (!name.trim()) return null;
		const trimmedName = name.trim();

		// Check if already exists
		if (this.#groups.some((g) => g.name.toLowerCase() === trimmedName.toLowerCase())) {
			return null;
		}

		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticGroup: Group = { id: tempId, name: trimmedName, sortOrder: this.#groups.length };
		this.#groups = [...this.#groups, optimisticGroup];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: trimmedName, sortOrder: this.#groups.length - 1 })
			});
			if (!res.ok) throw new Error('Failed to add group');
			const newGroup = await res.json();
			// Replace temp with real data
			this.#groups = this.#groups.map((g) => (g.id === tempId ? newGroup : g));
			return newGroup;
		} catch {
			// Rollback on failure
			this.#groups = this.#groups.filter((g) => g.id !== tempId);
			return null;
		}
	}

	async remove(id: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#groups.find((g) => g.id === id);
		if (!original) return false;

		this.#groups = this.#groups.filter((g) => g.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/groups`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete group');
			return true;
		} catch {
			// Rollback on failure
			this.#groups = [...this.#groups, original];
			return false;
		}
	}

	async rename(id: string, newName: string): Promise<boolean> {
		if (!newName.trim()) return false;

		// Optimistic: update immediately
		const original = this.#groups.find((g) => g.id === id);
		if (!original) return false;

		this.#groups = this.#groups.map((g) =>
			g.id === id ? { ...g, name: newName.trim() } : g
		);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/groups`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, name: newName.trim() })
			});
			if (!res.ok) throw new Error('Failed to rename group');
			return true;
		} catch {
			// Rollback on failure
			this.#groups = this.#groups.map((g) => (g.id === id ? original : g));
			return false;
		}
	}

	getById(id: string) {
		return this.#groups.find((g) => g.id === id);
	}

	getByName(name: string) {
		return this.#groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
	}
}

export const groupsStore = new GroupsStore();
