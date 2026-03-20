import {
	createReactiveCollection,
	createMutationTracker,
	createDefaultStrategy,
	createRestAdapter
} from '$lib/stores/core';
import type { ApiAdapter, OptimisticStrategy } from '$lib/stores/core';

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
	#types = createReactiveCollection<AssignmentType>();
	#assignments = createReactiveCollection<DailyAssignment>();
	#tracker = createMutationTracker();
	#typeStrategy: OptimisticStrategy<AssignmentType> = createDefaultStrategy<AssignmentType>();
	#typeAdapter: ApiAdapter<AssignmentType>;
	#orgId = '';

	constructor() {
		this.#typeAdapter = createRestAdapter<AssignmentType>(() => this.#orgId, 'assignment-types');
	}

	get types() {
		return this.#types.items;
	}

	get assignments() {
		return this.#assignments.items;
	}

	load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string) {
		if (this.#tracker.pending > 0 && orgId === this.#orgId) return;
		this.#types.set(types);
		this.#assignments.set(assignments);
		this.#orgId = orgId;
		this.#typeAdapter = createRestAdapter<AssignmentType>(() => this.#orgId, 'assignment-types');
	}

	// Assignment Type methods
	async addType(data: Omit<AssignmentType, 'id'>): Promise<AssignmentType | null> {
		const snapshot = this.#types.getSnapshot();
		const { newItems, tempId, rollback } = this.#typeStrategy.applyAdd(snapshot, data);
		this.#types.set(newItems);

		return this.#tracker.wrap(async () => {
			try {
				const created = await this.#typeAdapter.create(data);
				this.#types.set(this.#typeStrategy.reconcile(this.#types.getSnapshot(), tempId, created));
				return created;
			} catch {
				this.#types.set(rollback(this.#types.getSnapshot()));
				return null;
			}
		});
	}

	async updateType(id: string, data: Partial<Omit<AssignmentType, 'id'>>): Promise<boolean> {
		const snapshot = this.#types.getSnapshot();
		const original = snapshot.find((t) => t.id === id);
		if (!original) return false;

		const { newItems, rollback } = this.#typeStrategy.applyUpdate(snapshot, id, data as Partial<AssignmentType>);
		this.#types.set(newItems);

		return this.#tracker.wrap(async () => {
			try {
				const updated = await this.#typeAdapter.update(id, data);
				this.#types.set(this.#types.getSnapshot().map((t) => (t.id === id ? updated : t)));
				return true;
			} catch {
				this.#types.set(rollback(this.#types.getSnapshot()));
				return false;
			}
		});
	}

	async removeType(id: string): Promise<boolean> {
		const snapshot = this.#types.getSnapshot();
		const original = snapshot.find((t) => t.id === id);
		if (!original) return false;

		// Cascade: capture affected assignments for rollback
		const affectedAssignments = this.#assignments.getSnapshot().filter((a) => a.assignmentTypeId === id);

		const { newItems, rollback } = this.#typeStrategy.applyRemove(snapshot, id);
		this.#types.set(newItems);
		this.#assignments.set(this.#assignments.getSnapshot().filter((a) => a.assignmentTypeId !== id));

		return this.#tracker.wrap(async () => {
			try {
				const result = await this.#typeAdapter.remove(id);
				if (result !== 'deleted') throw new Error('Failed to delete assignment type');
				return true;
			} catch {
				this.#types.set(rollback(this.#types.getSnapshot()));
				this.#assignments.set([...this.#assignments.getSnapshot(), ...affectedAssignments]);
				return false;
			}
		});
	}

	getTypeById(id: string) {
		return this.#types.getSnapshot().find((t) => t.id === id);
	}

	// Daily Assignment methods
	async setAssignment(date: string, assignmentTypeId: string, assigneeId: string): Promise<boolean> {
		// Store existing assignment for rollback
		const existingAssignment = this.#assignments
			.getSnapshot()
			.find((a) => a.date === date && a.assignmentTypeId === assignmentTypeId);

		// Optimistic: remove existing and add new
		this.#assignments.set(
			this.#assignments.getSnapshot().filter((a) => !(a.date === date && a.assignmentTypeId === assignmentTypeId))
		);

		// Add optimistic assignment if assigneeId is provided
		const tempId = `temp-${crypto.randomUUID()}`;
		if (assigneeId) {
			const optimisticAssignment: DailyAssignment = {
				id: tempId,
				date,
				assignmentTypeId,
				assigneeId
			};
			this.#assignments.set([...this.#assignments.getSnapshot(), optimisticAssignment]);
		}

		return this.#tracker.wrap(async () => {
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
						this.#assignments.set(this.#assignments.getSnapshot().map((a) => (a.id === tempId ? data : a)));
					} else {
						this.#assignments.set(this.#assignments.getSnapshot().filter((a) => a.id !== tempId));
					}
				}

				return true;
			} catch {
				// Rollback on failure
				this.#assignments.set(this.#assignments.getSnapshot().filter((a) => a.id !== tempId));
				if (existingAssignment) {
					this.#assignments.set([...this.#assignments.getSnapshot(), existingAssignment]);
				}
				return false;
			}
		});
	}

	async removeAssignment(date: string, assignmentTypeId: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#assignments
			.getSnapshot()
			.find((a) => a.date === date && a.assignmentTypeId === assignmentTypeId);
		if (!original) return false;

		this.#assignments.set(
			this.#assignments.getSnapshot().filter((a) => !(a.date === date && a.assignmentTypeId === assignmentTypeId))
		);

		return this.#tracker.wrap(async () => {
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
				this.#assignments.set([...this.#assignments.getSnapshot(), original]);
				return false;
			}
		});
	}

	async setAssignmentBatch(
		assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]
	): Promise<boolean> {
		// Optimistic: apply all changes locally
		const originals: DailyAssignment[] = [];
		const tempEntries: DailyAssignment[] = [];

		let currentItems = this.#assignments.getSnapshot();

		for (const a of assignments) {
			const existing = currentItems.find((e) => e.date === a.date && e.assignmentTypeId === a.assignmentTypeId);
			if (existing) originals.push(existing);

			currentItems = currentItems.filter((e) => !(e.date === a.date && e.assignmentTypeId === a.assignmentTypeId));

			if (a.assigneeId) {
				const temp: DailyAssignment = {
					id: `temp-${crypto.randomUUID()}`,
					date: a.date,
					assignmentTypeId: a.assignmentTypeId,
					assigneeId: a.assigneeId
				};
				tempEntries.push(temp);
				currentItems = [...currentItems, temp];
			}
		}

		this.#assignments.set(currentItems);

		return this.#tracker.wrap(async () => {
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
				this.#assignments.set([...this.#assignments.getSnapshot().filter((a) => !tempIds.has(a.id)), ...inserted]);
				return true;
			} catch {
				// Rollback: remove temps, restore originals
				const tempIds = new Set(tempEntries.map((e) => e.id));
				this.#assignments.set([...this.#assignments.getSnapshot().filter((a) => !tempIds.has(a.id)), ...originals]);
				return false;
			}
		});
	}

	getAssignmentsForDate(date: string): DailyAssignment[] {
		return this.#assignments.getSnapshot().filter((a) => a.date === date);
	}

	getAssignmentForDate(date: string, assignmentTypeId: string): DailyAssignment | undefined {
		return this.#assignments.getSnapshot().find((a) => a.date === date && a.assignmentTypeId === assignmentTypeId);
	}

	getAssignmentsForPersonnel(personnelId: string): DailyAssignment[] {
		return this.#assignments.getSnapshot().filter((a) => a.assigneeId === personnelId);
	}

	getAssignmentsForGroup(groupName: string): DailyAssignment[] {
		return this.#assignments.getSnapshot().filter((a) => a.assigneeId === groupName);
	}

	getPersonnelAssignmentsForDate(personnelId: string, date: string): DailyAssignment[] {
		return this.#assignments.getSnapshot().filter((a) => a.assigneeId === personnelId && a.date === date);
	}
}

export const dailyAssignmentsStore = new DailyAssignmentsStore();
