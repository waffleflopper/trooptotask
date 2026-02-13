export interface AssignmentType {
	id: string;
	name: string;
	shortName: string;
	assignTo: 'personnel' | 'group';
	color: string;
}

export interface DailyAssignment {
	id: string;
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
}

class DailyAssignmentsStore {
	#types = $state<AssignmentType[]>([]);
	#assignments = $state<DailyAssignment[]>([]);
	#orgId = '';

	get types() {
		return this.#types;
	}

	get assignments() {
		return this.#assignments;
	}

	load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string) {
		this.#types = types;
		this.#assignments = assignments;
		this.#orgId = orgId;
	}

	// Assignment Type methods
	async addType(data: Omit<AssignmentType, 'id'>): Promise<AssignmentType | null> {
		const res = await fetch(`/org/${this.#orgId}/api/assignment-types`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) return null;
		const newType = await res.json();
		this.#types = [...this.#types, newType];
		return newType;
	}

	async updateType(id: string, data: Partial<Omit<AssignmentType, 'id'>>): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/assignment-types`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, ...data })
		});
		if (!res.ok) return false;
		const updated = await res.json();
		this.#types = this.#types.map((t) => (t.id === id ? updated : t));
		return true;
	}

	async removeType(id: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/assignment-types`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#types = this.#types.filter((t) => t.id !== id);
		this.#assignments = this.#assignments.filter((a) => a.assignmentTypeId !== id);
		return true;
	}

	getTypeById(id: string) {
		return this.#types.find((t) => t.id === id);
	}

	// Daily Assignment methods
	async setAssignment(date: string, assignmentTypeId: string, assigneeId: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/daily-assignments`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ date, assignmentTypeId, assigneeId })
		});
		if (!res.ok) return false;

		// Remove existing assignment of this type for this date locally
		this.#assignments = this.#assignments.filter(
			(a) => !(a.date === date && a.assignmentTypeId === assignmentTypeId)
		);

		// Add new assignment if assigneeId is provided
		if (assigneeId) {
			const data = await res.json();
			if (data.id) {
				this.#assignments = [...this.#assignments, data];
			}
		}

		return true;
	}

	async removeAssignment(date: string, assignmentTypeId: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/daily-assignments`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ date, assignmentTypeId })
		});
		if (!res.ok) return false;
		this.#assignments = this.#assignments.filter(
			(a) => !(a.date === date && a.assignmentTypeId === assignmentTypeId)
		);
		return true;
	}

	getAssignmentsForDate(date: string): DailyAssignment[] {
		return this.#assignments.filter((a) => a.date === date);
	}

	getAssignmentForDate(date: string, assignmentTypeId: string): DailyAssignment | undefined {
		return this.#assignments.find(
			(a) => a.date === date && a.assignmentTypeId === assignmentTypeId
		);
	}

	getAssignmentsForPersonnel(personnelId: string): DailyAssignment[] {
		return this.#assignments.filter((a) => a.assigneeId === personnelId);
	}

	getAssignmentsForGroup(groupName: string): DailyAssignment[] {
		return this.#assignments.filter((a) => a.assigneeId === groupName);
	}

	getPersonnelAssignmentsForDate(personnelId: string, date: string): DailyAssignment[] {
		return this.#assignments.filter(
			(a) => a.assigneeId === personnelId && a.date === date
		);
	}
}

export const dailyAssignmentsStore = new DailyAssignmentsStore();
