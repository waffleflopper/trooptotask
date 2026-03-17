export interface AssignmentType {
	id: string;
	name: string;
	shortName: string;
	assignTo: 'personnel' | 'group';
	color: string;
	exemptPersonnelIds: string[];
}

export interface DailyAssignment {
	id: string;
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
}

class DailyAssignmentsStore {
	#types = $state.raw<AssignmentType[]>([]);
	#assignments = $state.raw<DailyAssignment[]>([]);
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
		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticType: AssignmentType = { id: tempId, ...data };
		this.#types = [...this.#types, optimisticType];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/assignment-types`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add assignment type');
			const newType = await res.json();
			// Replace temp with real data
			this.#types = this.#types.map((t) => (t.id === tempId ? newType : t));
			return newType;
		} catch {
			// Rollback on failure
			this.#types = this.#types.filter((t) => t.id !== tempId);
			return null;
		}
	}

	async updateType(id: string, data: Partial<Omit<AssignmentType, 'id'>>): Promise<boolean> {
		// Optimistic: update immediately
		const original = this.#types.find((t) => t.id === id);
		if (!original) return false;

		this.#types = this.#types.map((t) => (t.id === id ? { ...t, ...data } : t));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/assignment-types`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update assignment type');
			const updated = await res.json();
			// Replace with server response
			this.#types = this.#types.map((t) => (t.id === id ? updated : t));
			return true;
		} catch {
			// Rollback on failure
			this.#types = this.#types.map((t) => (t.id === id ? original : t));
			return false;
		}
	}

	async removeType(id: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#types.find((t) => t.id === id);
		if (!original) return false;

		const affectedAssignments = this.#assignments.filter((a) => a.assignmentTypeId === id);
		this.#types = this.#types.filter((t) => t.id !== id);
		this.#assignments = this.#assignments.filter((a) => a.assignmentTypeId !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/assignment-types`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete assignment type');
			return true;
		} catch {
			// Rollback on failure
			this.#types = [...this.#types, original];
			this.#assignments = [...this.#assignments, ...affectedAssignments];
			return false;
		}
	}

	getTypeById(id: string) {
		return this.#types.find((t) => t.id === id);
	}

	// Daily Assignment methods
	async setAssignment(date: string, assignmentTypeId: string, assigneeId: string): Promise<boolean> {
		// Store existing assignment for rollback
		const existingAssignment = this.#assignments.find(
			(a) => a.date === date && a.assignmentTypeId === assignmentTypeId
		);

		// Optimistic: remove existing and add new
		this.#assignments = this.#assignments.filter((a) => !(a.date === date && a.assignmentTypeId === assignmentTypeId));

		// Add optimistic assignment if assigneeId is provided
		const tempId = `temp-${crypto.randomUUID()}`;
		if (assigneeId) {
			const optimisticAssignment: DailyAssignment = {
				id: tempId,
				date,
				assignmentTypeId,
				assigneeId
			};
			this.#assignments = [...this.#assignments, optimisticAssignment];
		}

		try {
			const res = await fetch(`/org/${this.#orgId}/api/daily-assignments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date, assignmentTypeId, assigneeId })
			});
			if (!res.ok) throw new Error('Failed to set assignment');

			// Replace temp with real data if assigneeId was provided
			if (assigneeId) {
				const data = await res.json();
				if (data.id) {
					this.#assignments = this.#assignments.map((a) => (a.id === tempId ? data : a));
				} else {
					this.#assignments = this.#assignments.filter((a) => a.id !== tempId);
				}
			}

			return true;
		} catch {
			// Rollback on failure
			this.#assignments = this.#assignments.filter((a) => a.id !== tempId);
			if (existingAssignment) {
				this.#assignments = [...this.#assignments, existingAssignment];
			}
			return false;
		}
	}

	async removeAssignment(date: string, assignmentTypeId: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#assignments.find((a) => a.date === date && a.assignmentTypeId === assignmentTypeId);
		if (!original) return false;

		this.#assignments = this.#assignments.filter((a) => !(a.date === date && a.assignmentTypeId === assignmentTypeId));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/daily-assignments`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date, assignmentTypeId })
			});
			if (!res.ok) throw new Error('Failed to remove assignment');
			return true;
		} catch {
			// Rollback on failure
			this.#assignments = [...this.#assignments, original];
			return false;
		}
	}

	async setAssignmentBatch(
		assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]
	): Promise<boolean> {
		// Optimistic: apply all changes locally
		const originals: DailyAssignment[] = [];
		const tempEntries: DailyAssignment[] = [];

		for (const a of assignments) {
			const existing = this.#assignments.find((e) => e.date === a.date && e.assignmentTypeId === a.assignmentTypeId);
			if (existing) originals.push(existing);

			this.#assignments = this.#assignments.filter(
				(e) => !(e.date === a.date && e.assignmentTypeId === a.assignmentTypeId)
			);

			if (a.assigneeId) {
				const temp: DailyAssignment = {
					id: `temp-${crypto.randomUUID()}`,
					date: a.date,
					assignmentTypeId: a.assignmentTypeId,
					assigneeId: a.assigneeId
				};
				tempEntries.push(temp);
				this.#assignments = [...this.#assignments, temp];
			}
		}

		try {
			const res = await fetch(`/org/${this.#orgId}/api/daily-assignments/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ records: assignments })
			});
			if (!res.ok) throw new Error('Failed to batch update assignments');

			const data = await res.json();
			const inserted: DailyAssignment[] = data.inserted;

			// Replace temp entries with real ones
			const tempIds = new Set(tempEntries.map((e) => e.id));
			this.#assignments = [...this.#assignments.filter((a) => !tempIds.has(a.id)), ...inserted];
			return true;
		} catch {
			// Rollback: remove temps, restore originals
			const tempIds = new Set(tempEntries.map((e) => e.id));
			this.#assignments = [...this.#assignments.filter((a) => !tempIds.has(a.id)), ...originals];
			return false;
		}
	}

	getAssignmentsForDate(date: string): DailyAssignment[] {
		return this.#assignments.filter((a) => a.date === date);
	}

	getAssignmentForDate(date: string, assignmentTypeId: string): DailyAssignment | undefined {
		return this.#assignments.find((a) => a.date === date && a.assignmentTypeId === assignmentTypeId);
	}

	getAssignmentsForPersonnel(personnelId: string): DailyAssignment[] {
		return this.#assignments.filter((a) => a.assigneeId === personnelId);
	}

	getAssignmentsForGroup(groupName: string): DailyAssignment[] {
		return this.#assignments.filter((a) => a.assigneeId === groupName);
	}

	getPersonnelAssignmentsForDate(personnelId: string, date: string): DailyAssignment[] {
		return this.#assignments.filter((a) => a.assigneeId === personnelId && a.date === date);
	}
}

export const dailyAssignmentsStore = new DailyAssignmentsStore();
