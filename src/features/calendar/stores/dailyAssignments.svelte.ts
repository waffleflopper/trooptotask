import { createReactiveCollection, createStore, createMutationLog, replay } from '$lib/stores/core';
import type { MutationEntry } from '$lib/stores/core';
import type { AssignmentType, DailyAssignment } from '$lib/types';

export type { AssignmentType, DailyAssignment } from '$lib/types';

class DailyAssignmentsStore {
	#typeStore = createStore<AssignmentType>({ resource: 'assignment-types' });
	#assignmentServerState = createReactiveCollection<DailyAssignment>();
	#assignmentLog = createMutationLog<DailyAssignment>();
	#orgId = '';

	get types() {
		return this.#typeStore.items;
	}

	get assignments() {
		return replay(this.#assignmentServerState.items, this.#assignmentLog.entries);
	}

	load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string) {
		if (orgId !== this.#orgId) {
			this.#assignmentLog.clear();
		}
		this.#typeStore.load(types, orgId);
		this.#assignmentServerState.set(assignments);
		this.#orgId = orgId;
	}

	// Assignment Type methods
	async addType(data: Omit<AssignmentType, 'id'>): Promise<AssignmentType | null> {
		return this.#typeStore.add(data);
	}

	async updateType(id: string, data: Partial<Omit<AssignmentType, 'id'>>): Promise<boolean> {
		return this.#typeStore.update(id, data);
	}

	async removeType(id: string): Promise<boolean> {
		const type = this.#typeStore.getById(id);
		if (!type) return false;

		// Cascade: optimistically remove affected assignments via log
		const affectedIds = this.#getAssignmentSnapshot()
			.filter((a) => a.assignmentTypeId === id)
			.map((a) => a.id);

		let cascadeMutationId: string | null = null;
		if (affectedIds.length > 0) {
			cascadeMutationId = crypto.randomUUID();
			this.#assignmentLog.push({ type: 'remove-batch', mutationId: cascadeMutationId, targetIds: affectedIds });
		}

		const result = await this.#typeStore.remove(id);

		if (result === 'deleted') {
			// Confirm cascade in serverState
			const idSet = new Set(affectedIds);
			this.#assignmentServerState.set(this.#assignmentServerState.getSnapshot().filter((a) => !idSet.has(a.id)));
		}

		// Resolve cascade log (success = serverState updated, failure = auto-rollback)
		if (cascadeMutationId) {
			this.#assignmentLog.resolve(cascadeMutationId);
		}

		return result === 'deleted';
	}

	getTypeById(id: string) {
		return this.#typeStore.getById(id);
	}

	// Daily Assignment methods
	#getAssignmentSnapshot(): DailyAssignment[] {
		return replay(this.#assignmentServerState.getSnapshot(), this.#assignmentLog.entries);
	}

	async setAssignment(date: string, assignmentTypeId: string, assigneeId: string): Promise<boolean> {
		const existing = this.#getAssignmentSnapshot().find(
			(a) => a.date === date && a.assignmentTypeId === assignmentTypeId
		);

		let removeMutationId: string | null = null;
		if (existing) {
			removeMutationId = crypto.randomUUID();
			this.#assignmentLog.push({ type: 'remove', mutationId: removeMutationId, targetId: existing.id });
		}

		let addMutationId: string | null = null;
		let tempId: string | null = null;
		if (assigneeId) {
			addMutationId = crypto.randomUUID();
			tempId = `temp-${crypto.randomUUID()}`;
			this.#assignmentLog.push({
				type: 'add',
				mutationId: addMutationId,
				tempId,
				data: { date, assignmentTypeId, assigneeId } as Omit<DailyAssignment, 'id'>
			});
		}

		try {
			const res = await fetch(`/org/${this.#orgId}/api/daily-assignments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date, assignmentTypeId, assigneeId })
			});
			if (!res.ok) throw new Error('Failed to set assignment');

			// Update serverState
			let current = this.#assignmentServerState.getSnapshot();
			if (existing) {
				current = current.filter((a) => a.id !== existing.id);
			}
			if (assigneeId) {
				const data = await res.json();
				if (data.id) {
					current = [...current, data];
				}
			}
			this.#assignmentServerState.set(current);

			if (removeMutationId) this.#assignmentLog.resolve(removeMutationId);
			if (addMutationId) this.#assignmentLog.resolve(addMutationId);
			return true;
		} catch {
			if (removeMutationId) this.#assignmentLog.resolve(removeMutationId);
			if (addMutationId) this.#assignmentLog.resolve(addMutationId);
			return false;
		}
	}

	async removeAssignment(date: string, assignmentTypeId: string): Promise<boolean> {
		const original = this.#getAssignmentSnapshot().find(
			(a) => a.date === date && a.assignmentTypeId === assignmentTypeId
		);
		if (!original) return false;

		const mutationId = crypto.randomUUID();
		this.#assignmentLog.push({ type: 'remove', mutationId, targetId: original.id });

		try {
			const res = await fetch(`/org/${this.#orgId}/api/daily-assignments`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date, assignmentTypeId })
			});
			if (!res.ok) throw new Error('Failed to remove assignment');

			this.#assignmentServerState.set(this.#assignmentServerState.getSnapshot().filter((a) => a.id !== original.id));
			this.#assignmentLog.resolve(mutationId);
			return true;
		} catch {
			this.#assignmentLog.resolve(mutationId);
			return false;
		}
	}

	async setAssignmentBatch(
		assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]
	): Promise<boolean> {
		const removeMutationIds: string[] = [];
		const existingIds: string[] = [];
		const tempIds: string[] = [];
		const addData: Omit<DailyAssignment, 'id'>[] = [];

		for (const a of assignments) {
			const existing = this.#getAssignmentSnapshot().find(
				(e) => e.date === a.date && e.assignmentTypeId === a.assignmentTypeId
			);
			if (existing) {
				const rmId = crypto.randomUUID();
				removeMutationIds.push(rmId);
				existingIds.push(existing.id);
				this.#assignmentLog.push({ type: 'remove', mutationId: rmId, targetId: existing.id });
			}

			if (a.assigneeId) {
				tempIds.push(`temp-${crypto.randomUUID()}`);
				addData.push({
					date: a.date,
					assignmentTypeId: a.assignmentTypeId,
					assigneeId: a.assigneeId
				});
			}
		}

		let addMutationId: string | null = null;
		if (tempIds.length > 0) {
			addMutationId = crypto.randomUUID();
			this.#assignmentLog.push({ type: 'add-batch', mutationId: addMutationId, tempIds, data: addData });
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

			// Update serverState: remove old, add new
			let current = this.#assignmentServerState.getSnapshot();
			if (existingIds.length > 0) {
				const idSet = new Set(existingIds);
				current = current.filter((a) => !idSet.has(a.id));
			}
			this.#assignmentServerState.set([...current, ...inserted]);

			for (const rmId of removeMutationIds) this.#assignmentLog.resolve(rmId);
			if (addMutationId) this.#assignmentLog.resolve(addMutationId);
			return true;
		} catch {
			for (const rmId of removeMutationIds) this.#assignmentLog.resolve(rmId);
			if (addMutationId) this.#assignmentLog.resolve(addMutationId);
			return false;
		}
	}

	getAssignmentsForDate(date: string): DailyAssignment[] {
		return this.#getAssignmentSnapshot().filter((a) => a.date === date);
	}

	getAssignmentForDate(date: string, assignmentTypeId: string): DailyAssignment | undefined {
		return this.#getAssignmentSnapshot().find((a) => a.date === date && a.assignmentTypeId === assignmentTypeId);
	}

	getAssignmentsForPersonnel(personnelId: string): DailyAssignment[] {
		return this.#getAssignmentSnapshot().filter((a) => a.assigneeId === personnelId);
	}

	getAssignmentsForGroup(groupName: string): DailyAssignment[] {
		return this.#getAssignmentSnapshot().filter((a) => a.assigneeId === groupName);
	}

	getPersonnelAssignmentsForDate(personnelId: string, date: string): DailyAssignment[] {
		return this.#getAssignmentSnapshot().filter((a) => a.assigneeId === personnelId && a.date === date);
	}
}

export const dailyAssignmentsStore = new DailyAssignmentsStore();
