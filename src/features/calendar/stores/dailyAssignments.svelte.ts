/**
 * Daily assignments store — assignment types and daily assignment records for the calendar.
 *
 * Combines two collections in one store: `types` (the named duty slots like "CQ", "SDO")
 * and `assignments` (the actual date-assignee records). Kept together because every
 * mutation needs both collections in scope.
 *
 * Key extended methods:
 * - `setAssignment(date, assignmentTypeId, assigneeId)` — upserts one assignment
 * - `removeAssignment(date, assignmentTypeId)` — deletes one assignment
 * - `setAssignmentBatch(assignments[])` — bulk upsert used by the assignment planner
 * - `getAssignmentsForDate(date)` — fast lookup for rendering a calendar row
 *
 * Loaded by the calendar and dashboard page load functions.
 */
import { defineStore } from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import type { AssignmentType, DailyAssignment } from '$lib/types';

export type { AssignmentType, DailyAssignment } from '$lib/types';

const typesStore = defineStore<AssignmentType>({
	table: 'assignment_types',
	overrides: {
		onError: (operation, error) => {
			const action = operation === 'add' ? 'create' : operation === 'update' ? 'update' : 'delete';
			toastStore.error(error instanceof Error ? error.message : `Failed to ${action} assignment type`);
		}
	}
});

interface AssignmentExtensions extends Record<string, unknown> {
	readonly types: AssignmentType[];
	readonly assignments: DailyAssignment[];
	load: (types: AssignmentType[], assignments: DailyAssignment[], orgId: string) => void;
	addType: (data: Omit<AssignmentType, 'id'>) => Promise<AssignmentType | null>;
	updateType: (id: string, data: Partial<Omit<AssignmentType, 'id'>>) => Promise<boolean>;
	removeType: (id: string) => Promise<boolean>;
	getTypeById: (id: string) => AssignmentType | undefined;
	setAssignment: (date: string, assignmentTypeId: string, assigneeId: string) => Promise<boolean>;
	removeAssignment: (date: string, assignmentTypeId: string) => Promise<boolean>;
	setAssignmentBatch: (
		assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]
	) => Promise<boolean>;
	getAssignmentsForDate: (date: string) => DailyAssignment[];
	getAssignmentForDate: (date: string, assignmentTypeId: string) => DailyAssignment | undefined;
	getAssignmentsForPersonnel: (personnelId: string) => DailyAssignment[];
	getAssignmentsForGroup: (groupName: string) => DailyAssignment[];
	getPersonnelAssignmentsForDate: (personnelId: string, date: string) => DailyAssignment[];
}

type AssignmentBatchRecord = { date: string; assignmentTypeId: string; assigneeId: string };

function toAssignmentSlotKey(date: string, assignmentTypeId: string): string {
	return `${date}::${assignmentTypeId}`;
}

function duplicateAssignmentBatchSlot(assignments: AssignmentBatchRecord[]): AssignmentBatchRecord | null {
	// Local duplicate detection is not read by Svelte reactivity; avoid SvelteSet overhead here.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const seen = new Set<string>();

	for (const assignment of assignments) {
		const key = toAssignmentSlotKey(assignment.date, assignment.assignmentTypeId);
		if (seen.has(key)) return assignment;
		seen.add(key);
	}

	return null;
}

function normalizeAssignmentBatch(assignments: AssignmentBatchRecord[]): AssignmentBatchRecord[] {
	return assignments.map((assignment) => ({ ...assignment, assigneeId: assignment.assigneeId.trim() }));
}

function enhance(base: Store<DailyAssignment>, internals: StoreInternals<DailyAssignment>): AssignmentExtensions {
	function getAssignmentSnapshot(): DailyAssignment[] {
		return internals.snapshot();
	}

	async function readResponseErrorMessage(res: Response, fallback: string): Promise<string> {
		const raw = await res.text();
		if (!raw) return fallback;
		try {
			const parsed = JSON.parse(raw) as { message?: string; error?: string };
			return parsed.message ?? parsed.error ?? raw;
		} catch {
			return raw;
		}
	}

	return {
		get types() {
			return typesStore.items;
		},

		get assignments() {
			return internals.replay();
		},

		load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string) {
			typesStore.load(types, orgId);
			base.load(assignments, orgId);
		},

		// Assignment Type methods
		async addType(data: Omit<AssignmentType, 'id'>): Promise<AssignmentType | null> {
			return typesStore.add(data);
		},

		async updateType(id: string, data: Partial<Omit<AssignmentType, 'id'>>): Promise<boolean> {
			return typesStore.update(id, data);
		},

		async removeType(id: string): Promise<boolean> {
			const type = typesStore.getById(id);
			if (!type) return false;

			// Cascade: optimistically remove affected assignments via log
			const affectedIds = getAssignmentSnapshot()
				.filter((a) => a.assignmentTypeId === id)
				.map((a) => a.id);

			let cascadeMutationId: string | null = null;
			if (affectedIds.length > 0) {
				cascadeMutationId = crypto.randomUUID();
				internals.log.push({ type: 'remove-batch', mutationId: cascadeMutationId, targetIds: affectedIds });
			}

			const result = await typesStore.remove(id);

			if (result === 'deleted') {
				// Confirm cascade in serverState
				const idSet = new Set(affectedIds);
				internals.serverState.set(internals.serverState.getSnapshot().filter((a) => !idSet.has(a.id)));
			}

			// Resolve cascade log (success = serverState updated, failure = auto-rollback)
			if (cascadeMutationId) {
				internals.log.resolve(cascadeMutationId);
			}

			return result === 'deleted';
		},

		getTypeById(id: string) {
			return typesStore.getById(id);
		},

		// Daily Assignment methods
		async setAssignment(date: string, assignmentTypeId: string, assigneeId: string): Promise<boolean> {
			const existing = getAssignmentSnapshot().find((a) => a.date === date && a.assignmentTypeId === assignmentTypeId);

			let removeMutationId: string | null = null;
			if (existing) {
				removeMutationId = crypto.randomUUID();
				internals.log.push({ type: 'remove', mutationId: removeMutationId, targetId: existing.id });
			}

			let addMutationId: string | null = null;
			let tempId: string | null = null;
			if (assigneeId) {
				addMutationId = crypto.randomUUID();
				tempId = `temp-${crypto.randomUUID()}`;
				internals.log.push({
					type: 'add',
					mutationId: addMutationId,
					tempId,
					data: { date, assignmentTypeId, assigneeId } as Omit<DailyAssignment, 'id'>
				});
			}

			try {
				const res = await fetch(`/org/${internals.orgId()}/api/daily-assignments`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ date, assignmentTypeId, assigneeId })
				});
				if (!res.ok) {
					throw new Error(await readResponseErrorMessage(res, 'Failed to set assignment'));
				}

				// Update serverState
				let current = internals.serverState.getSnapshot();
				if (existing) {
					current = current.filter((a) => a.id !== existing.id);
				}
				if (assigneeId) {
					const data = await res.json();
					if (data.id) {
						current = [...current, data];
					}
				}
				internals.serverState.set(current);

				if (removeMutationId) internals.log.resolve(removeMutationId);
				if (addMutationId) internals.log.resolve(addMutationId);
				return true;
			} catch (error) {
				if (removeMutationId) internals.log.resolve(removeMutationId);
				if (addMutationId) internals.log.resolve(addMutationId);
				toastStore.error(error instanceof Error ? error.message : 'Failed to set assignment');
				return false;
			}
		},

		async removeAssignment(date: string, assignmentTypeId: string): Promise<boolean> {
			const original = getAssignmentSnapshot().find((a) => a.date === date && a.assignmentTypeId === assignmentTypeId);
			if (!original) return false;

			const mutationId = crypto.randomUUID();
			internals.log.push({ type: 'remove', mutationId, targetId: original.id });

			try {
				const res = await fetch(`/org/${internals.orgId()}/api/daily-assignments`, {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ date, assignmentTypeId })
				});
				if (!res.ok) throw new Error('Failed to remove assignment');

				internals.serverState.set(internals.serverState.getSnapshot().filter((a) => a.id !== original.id));
				internals.log.resolve(mutationId);
				return true;
			} catch {
				internals.log.resolve(mutationId);
				return false;
			}
		},

		async setAssignmentBatch(
			assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]
		): Promise<boolean> {
			const normalizedAssignments = normalizeAssignmentBatch(assignments);
			const duplicateSlot = duplicateAssignmentBatchSlot(normalizedAssignments);
			if (duplicateSlot) {
				toastStore.error(
					`Duplicate daily assignment slot in batch: ${duplicateSlot.date} / ${duplicateSlot.assignmentTypeId}`
				);
				return false;
			}

			const removeMutationIds: string[] = [];
			const existingIds: string[] = [];
			const tempIds: string[] = [];
			const addData: Omit<DailyAssignment, 'id'>[] = [];
			const existingBySlotKey = new Map(
				getAssignmentSnapshot().map((assignment) => [
					toAssignmentSlotKey(assignment.date, assignment.assignmentTypeId),
					assignment
				])
			);

			for (const a of normalizedAssignments) {
				const existing = existingBySlotKey.get(toAssignmentSlotKey(a.date, a.assignmentTypeId));
				if (existing) {
					const rmId = crypto.randomUUID();
					removeMutationIds.push(rmId);
					existingIds.push(existing.id);
					internals.log.push({ type: 'remove', mutationId: rmId, targetId: existing.id });
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
				internals.log.push({ type: 'add-batch', mutationId: addMutationId, tempIds, data: addData });
			}

			try {
				const res = await fetch(`/org/${internals.orgId()}/api/daily-assignments/batch`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ records: normalizedAssignments })
				});
				if (!res.ok) {
					throw new Error(await readResponseErrorMessage(res, 'Failed to batch update assignments'));
				}

				const data = await res.json();
				const inserted: DailyAssignment[] = data.inserted;

				// Update serverState: remove old, add new
				let current = internals.serverState.getSnapshot();
				if (existingIds.length > 0) {
					const idSet = new Set(existingIds);
					current = current.filter((a) => !idSet.has(a.id));
				}
				internals.serverState.set([...current, ...inserted]);

				for (const rmId of removeMutationIds) internals.log.resolve(rmId);
				if (addMutationId) internals.log.resolve(addMutationId);
				return true;
			} catch (error) {
				for (const rmId of removeMutationIds) internals.log.resolve(rmId);
				if (addMutationId) internals.log.resolve(addMutationId);
				toastStore.error(error instanceof Error ? error.message : 'Failed to batch update assignments');
				return false;
			}
		},

		getAssignmentsForDate(date: string): DailyAssignment[] {
			return getAssignmentSnapshot().filter((a) => a.date === date);
		},

		getAssignmentForDate(date: string, assignmentTypeId: string): DailyAssignment | undefined {
			return getAssignmentSnapshot().find((a) => a.date === date && a.assignmentTypeId === assignmentTypeId);
		},

		getAssignmentsForPersonnel(personnelId: string): DailyAssignment[] {
			return getAssignmentSnapshot().filter((a) => a.assigneeId === personnelId);
		},

		getAssignmentsForGroup(groupName: string): DailyAssignment[] {
			return getAssignmentSnapshot().filter((a) => a.assigneeId === groupName);
		},

		getPersonnelAssignmentsForDate(personnelId: string, date: string): DailyAssignment[] {
			return getAssignmentSnapshot().filter((a) => a.assigneeId === personnelId && a.date === date);
		}
	};
}

export const dailyAssignmentsStore = defineStore<DailyAssignment, AssignmentExtensions>(
	{ table: 'daily_assignments' },
	enhance
);
