export interface Group {
	id: string;
	name: string;
	sortOrder: number;
}

class GroupsStore {
	#groups = $state<Group[]>([]);
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

		const res = await fetch(`/org/${this.#orgId}/api/groups`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: trimmedName, sortOrder: this.#groups.length })
		});
		if (!res.ok) return null;
		const newGroup = await res.json();
		this.#groups = [...this.#groups, newGroup];
		return newGroup;
	}

	async remove(id: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/groups`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#groups = this.#groups.filter((g) => g.id !== id);
		return true;
	}

	async rename(id: string, newName: string): Promise<boolean> {
		if (!newName.trim()) return false;
		const res = await fetch(`/org/${this.#orgId}/api/groups`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, name: newName.trim() })
		});
		if (!res.ok) return false;
		this.#groups = this.#groups.map((g) =>
			g.id === id ? { ...g, name: newName.trim() } : g
		);
		return true;
	}

	getById(id: string) {
		return this.#groups.find((g) => g.id === id);
	}

	getByName(name: string) {
		return this.#groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
	}
}

export const groupsStore = new GroupsStore();
