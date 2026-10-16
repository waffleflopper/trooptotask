/**
 * Daily assignments store — assignment types and daily assignment records for the calendar.
 *
 * Combines two collections in one store: `types` (named Calendar assignments like "CQ", "SDO")
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
import { defineStore, stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import { assignmentTypesSchema, type AssignmentType, type DailyAssignment } from '$features/calendar/contracts';
import { assignmentSlotKey } from '$features/calendar/utils/calendarIndexes';
import { confirmedNotSaved } from './calendarCommandResponse';

export type { AssignmentType } from '$features/calendar/contracts';
export type { DailyAssignment } from '$features/calendar/contracts';

export type DateHeaderChange =
	| { status: 'saved' | 'stale' | 'busy' }
	| { status: 'not-saved'; message: string; showsSaved: boolean }
	| { status: 'unconfirmed'; showsSaved: boolean };

type HeaderFlight = Readonly<{
	assignmentTypeId: string;
	orgId: string;
	inLifetime: () => boolean;
}>;

type ConfirmedCatalog = Readonly<{ orgId: string; inLifetime: () => boolean }>;

function canonicalCatalog(types: readonly AssignmentType[]): string | null {
	const parsed = assignmentTypesSchema.safeParse(types);
	if (!parsed.success) return null;
	return JSON.stringify(
		parsed.data
			.map((type) => ({ ...type, archivedAt: type.archivedAt ?? null }))
			.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
	);
}

function sameCatalog(a: readonly AssignmentType[], b: readonly AssignmentType[]): boolean {
	const canonical = canonicalCatalog(a);
	return canonical !== null && canonical === canonicalCatalog(b);
}

const typesStore = defineStore<AssignmentType>({ table: 'assignment_types' });

interface AssignmentExtensions extends Record<string, unknown> {
	readonly types: AssignmentType[];
	readonly assignments: DailyAssignment[];
	readonly typesBusy: boolean;
	readonly pendingDateHeaderId: string | null;
	load: (types: AssignmentType[], assignments: DailyAssignment[], orgId: string) => void;
	addType: (data: Omit<AssignmentType, 'id'>) => Promise<AssignmentType | null>;
	updateType: (id: string, data: Partial<Omit<AssignmentType, 'id'>>) => Promise<boolean>;
	removeType: (id: string) => Promise<boolean>;
	setDateHeader: (assignmentTypeId: string) => Promise<DateHeaderChange>;
	getTypeById: (id: string) => AssignmentType | undefined;
	setAssignment: (date: string, assignmentTypeId: string, assigneeId: string) => Promise<boolean>;
	removeAssignment: (date: string, assignmentTypeId: string) => Promise<boolean>;
	setAssignmentBatch: (
		assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]
	) => Promise<boolean>;
	getAssignmentsForDate: (date: string) => DailyAssignment[];
	getAssignmentForDate: (date: string, assignmentTypeId: string) => DailyAssignment | undefined;
	getAssignmentsForPersonnel: (personnelId: string) => DailyAssignment[];
	getAssignmentsForGroup: (groupId: string) => DailyAssignment[];
	getPersonnelAssignmentsForDate: (personnelId: string, date: string) => DailyAssignment[];
}

type AssignmentBatchRecord = { date: string; assignmentTypeId: string; assigneeId: string };

function duplicateAssignmentBatchSlot(assignments: AssignmentBatchRecord[]): AssignmentBatchRecord | null {
	// Local duplicate detection is not read by Svelte reactivity; avoid SvelteSet overhead here.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const seen = new Set<string>();

	for (const assignment of assignments) {
		const key = assignmentSlotKey(assignment.date, assignment.assignmentTypeId);
		if (seen.has(key)) return assignment;
		seen.add(key);
	}

	return null;
}

function inSlot(date: string, assignmentTypeId: string) {
	return (assignment: DailyAssignment) => assignment.date === date && assignment.assignmentTypeId === assignmentTypeId;
}

function normalizeAssignmentBatch(assignments: AssignmentBatchRecord[]): AssignmentBatchRecord[] {
	return assignments.map((assignment) => ({ ...assignment, assigneeId: assignment.assigneeId.trim() }));
}

function enhance(base: Store<DailyAssignment>, internals: StoreInternals<DailyAssignment>): AssignmentExtensions {
	function getAssignmentSnapshot(): DailyAssignment[] {
		return internals.snapshot();
	}

	async function readResponseErrorMessage(res: Response, fallback: string): Promise<string> {
		const raw = await res.text().catch(() => '');
		if (!raw) return fallback;
		try {
			const parsed = JSON.parse(raw) as { message?: string; error?: string };
			return parsed.message ?? parsed.error ?? raw;
		} catch {
			return raw;
		}
	}

	let headerFlight = $state.raw<HeaderFlight | null>(null);
	let confirmedCatalog: ConfirmedCatalog | null = null;
	let disputedDuringWrites: ConfirmedCatalog | null = null;
	let typeWrites: ConfirmedCatalog[] = [];
	let catalogEpoch = 0;
	let catalogRead: { epoch: number; confirmed: ConfirmedCatalog } | null = null;

	function currentHeaderFlight(): HeaderFlight | null {
		return headerFlight && headerFlight.inLifetime() && headerFlight.orgId === typesStore.orgId ? headerFlight : null;
	}

	function isCurrentHeaderFlight(flight: HeaderFlight): boolean {
		return currentHeaderFlight() === flight;
	}

	function currentConfirmedCatalog(): ConfirmedCatalog | null {
		return confirmedCatalog && confirmedCatalog.inLifetime() && confirmedCatalog.orgId === typesStore.orgId
			? confirmedCatalog
			: null;
	}

	function forgetStaleTypeWrites(orgId: string) {
		typeWrites = typeWrites.filter((write) => write.orgId === orgId && write.inLifetime());
	}

	function deferSupersededCatalogRead() {
		if (catalogRead?.epoch === catalogEpoch) disputedDuringWrites = catalogRead.confirmed;
		catalogEpoch++;
	}

	function readDisputedCatalogWhenIdle() {
		const disputed = disputedDuringWrites;
		if (!disputed || typesStore.busy || typeWrites.length > 0) return;
		disputedDuringWrites = null;
		const confirmed = currentConfirmedCatalog();
		if (confirmed && disputed.inLifetime() && disputed.orgId === confirmed.orgId) void reconcileCatalog(confirmed);
	}

	function admitTypeWrite(): ConfirmedCatalog {
		deferSupersededCatalogRead();
		forgetStaleTypeWrites(typesStore.orgId);
		const write = Object.freeze({ orgId: typesStore.orgId, inLifetime: stillInOrganizationLifetime() });
		typeWrites.push(write);
		return write;
	}

	function settleTypeWrite(write: ConfirmedCatalog) {
		typeWrites = typeWrites.filter((pending) => pending !== write);
		forgetStaleTypeWrites(typesStore.orgId);
		readDisputedCatalogWhenIdle();
	}

	async function adoptSavedTypesIfUnchanged(orgId: string, owns: () => boolean): Promise<number | null> {
		if (!owns()) return null;
		const loadVersion = typesStore.loadVersion;
		try {
			const res = await withinOrganizationLifetime(fetch(`/org/${orgId}/api/assignment-types`));
			if (!res.ok || !owns()) return null;
			const saved = assignmentTypesSchema.safeParse(await withinOrganizationLifetime(res.json()));
			if (!saved.success || !owns() || typesStore.loadVersion !== loadVersion) return null;
			typesStore.load(saved.data, orgId);
			return typesStore.loadVersion;
		} catch {
			return null;
		}
	}

	async function reconcileCatalog(confirmed: ConfirmedCatalog): Promise<void> {
		const epoch = catalogEpoch;
		catalogRead = { epoch, confirmed };
		const owns = () => catalogEpoch === epoch && currentConfirmedCatalog() === confirmed;
		const adopted = await adoptSavedTypesIfUnchanged(confirmed.orgId, owns);
		if (catalogRead?.epoch === epoch) catalogRead = null;
		if (adopted === null && owns()) {
			toastStore.error("We couldn't refresh assignment types. Reload to see the saved types.");
		}
	}

	function dateHeaderFailureMessage(
		result: Extract<DateHeaderChange, { status: 'not-saved' | 'unconfirmed' }>
	): string {
		if (result.status === 'not-saved') {
			return result.showsSaved ? result.message : `${result.message} Reload to see the saved header.`;
		}
		if (!result.showsSaved) return "We couldn't confirm the date header change. Reload to see the saved header.";
		const saved = typesStore.items.find((type) => !type.archivedAt && type.showInDateHeader);
		return saved
			? `We couldn't confirm the date header change. The saved header is ${saved.name}.`
			: "We couldn't confirm the date header change. No date header is saved.";
	}

	function reportDateHeaderOutcome(flight: HeaderFlight, result: DateHeaderChange): DateHeaderChange {
		if (!isCurrentHeaderFlight(flight)) return { status: 'stale' };
		if (result.status === 'saved' || ('showsSaved' in result && result.showsSaved)) {
			confirmedCatalog = flight;
		}
		if (result.status === 'not-saved' || result.status === 'unconfirmed') {
			toastStore.error(dateHeaderFailureMessage(result));
		}
		return result;
	}

	async function sendAssignments(path: '' | '/batch', method: 'POST' | 'DELETE', body: unknown, failure: string) {
		const res = await fetch(`/org/${internals.orgId()}/api/daily-assignments${path}`, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error(await readResponseErrorMessage(res, failure));
		return res;
	}

	return {
		get types() {
			return typesStore.items;
		},

		get assignments() {
			return internals.replay();
		},

		get typesBusy() {
			return typesStore.busy || currentHeaderFlight() !== null;
		},

		get pendingDateHeaderId() {
			return currentHeaderFlight()?.assignmentTypeId ?? null;
		},

		load(types: AssignmentType[], assignments: DailyAssignment[], orgId: string) {
			forgetStaleTypeWrites(orgId);
			if (headerFlight && (headerFlight.orgId !== orgId || !headerFlight.inLifetime())) headerFlight = null;
			if (confirmedCatalog && (confirmedCatalog.orgId !== orgId || !confirmedCatalog.inLifetime())) {
				confirmedCatalog = null;
			}
			const confirmed = headerFlight ? null : confirmedCatalog;
			const disputed = confirmed !== null && (typesStore.busy || !sameCatalog(types, typesStore.items));
			if (!confirmed) typesStore.load(types, orgId);
			if (disputed) catalogEpoch++;
			disputedDuringWrites = disputed && typesStore.busy ? confirmed : null;
			base.load(assignments, orgId);
			if (disputed && !typesStore.busy) void reconcileCatalog(confirmed);
		},

		// Assignment Type methods
		async addType(data: Omit<AssignmentType, 'id'>): Promise<AssignmentType | null> {
			if (currentHeaderFlight()) return null;
			const write = admitTypeWrite();
			try {
				const created = await typesStore.add(data);
				confirmedCatalog = write;
				return created;
			} finally {
				settleTypeWrite(write);
			}
		},

		async updateType(id: string, data: Partial<Omit<AssignmentType, 'id'>>): Promise<boolean> {
			if (currentHeaderFlight()) return false;
			const write = admitTypeWrite();
			try {
				const updated = await typesStore.updateOrThrow(id, data);
				if (updated) confirmedCatalog = write;
				return updated;
			} finally {
				settleTypeWrite(write);
			}
		},

		async removeType(id: string): Promise<boolean> {
			if (currentHeaderFlight()) return false;
			const type = typesStore.getById(id);
			if (!type) return false;
			const write = admitTypeWrite();

			// Cascade: optimistically remove affected assignments via log
			const ofType = (assignment: DailyAssignment) => assignment.assignmentTypeId === id;
			const affectedIds = getAssignmentSnapshot()
				.filter(ofType)
				.map((a) => a.id);

			let cascadeMutationId: string | null = null;
			if (affectedIds.length > 0) {
				cascadeMutationId = crypto.randomUUID();
				internals.log.push({ type: 'remove-batch', mutationId: cascadeMutationId, targetIds: affectedIds });
			}

			const result = await typesStore.remove(id);

			if (result === 'deleted') {
				internals.commit({ deletedWhere: ofType });
				confirmedCatalog = write;
			}

			// Resolve cascade log (success = serverState updated, failure = auto-rollback)
			if (cascadeMutationId) {
				internals.log.resolve(cascadeMutationId);
			}

			settleTypeWrite(write);
			return result === 'deleted';
		},

		async setDateHeader(assignmentTypeId: string): Promise<DateHeaderChange> {
			if (typesStore.busy || currentHeaderFlight()) return { status: 'busy' };
			deferSupersededCatalogRead();
			const flight: HeaderFlight = Object.freeze({
				assignmentTypeId,
				orgId: typesStore.orgId,
				inLifetime: stillInOrganizationLifetime()
			});
			headerFlight = flight;
			const owns = () => isCurrentHeaderFlight(flight);
			const loadVersion = typesStore.loadVersion;
			try {
				let res: Response;
				try {
					res = await withinOrganizationLifetime(
						fetch(`/org/${flight.orgId}/api/assignment-types/date-header`, {
							method: 'PUT',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ assignmentTypeId })
						})
					);
				} catch {
					const adopted = await adoptSavedTypesIfUnchanged(flight.orgId, owns);
					return reportDateHeaderOutcome(flight, {
						status: 'unconfirmed',
						showsSaved: adopted === typesStore.loadVersion
					});
				}
				if (!isCurrentHeaderFlight(flight)) return { status: 'stale' };
				if (res.ok && typesStore.loadVersion === loadVersion) {
					typesStore.updateLocalWhere(
						(type) => type.showInDateHeader !== (type.id === assignmentTypeId),
						(type) => ({ ...type, showInDateHeader: type.id === assignmentTypeId })
					);
					return reportDateHeaderOutcome(flight, { status: 'saved' });
				}
				if (res.ok) {
					const showsSaved = (await adoptSavedTypesIfUnchanged(flight.orgId, owns)) === typesStore.loadVersion;
					return reportDateHeaderOutcome(
						flight,
						showsSaved && typesStore.getById(assignmentTypeId)?.showInDateHeader
							? { status: 'saved' }
							: { status: 'unconfirmed', showsSaved }
					);
				}
				const message = confirmedNotSaved(res)
					? await withinOrganizationLifetime(readResponseErrorMessage(res, 'Failed to update the date header'))
					: null;
				const showsSaved = (await adoptSavedTypesIfUnchanged(flight.orgId, owns)) === typesStore.loadVersion;
				return reportDateHeaderOutcome(
					flight,
					message === null ? { status: 'unconfirmed', showsSaved } : { status: 'not-saved', message, showsSaved }
				);
			} finally {
				if (headerFlight === flight) headerFlight = null;
				readDisputedCatalogWhenIdle();
			}
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
				const saved = await internals.withinOrganization(
					sendAssignments('', 'POST', { date, assignmentTypeId, assigneeId }, 'Failed to set assignment').then((res) =>
						assigneeId ? (res.json() as Promise<DailyAssignment>) : null
					)
				);

				internals.commit({ deletedWhere: inSlot(date, assignmentTypeId) });
				if (saved?.id) internals.commit({ saved: [saved] });

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
				await internals.withinOrganization(
					sendAssignments('', 'DELETE', { date, assignmentTypeId }, 'Failed to remove assignment')
				);

				internals.commit({ deletedWhere: inSlot(date, assignmentTypeId) });
				internals.log.resolve(mutationId);
				return true;
			} catch (error) {
				internals.log.resolve(mutationId);
				toastStore.error(error instanceof Error ? error.message : 'Failed to remove assignment');
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

			const existingIds: string[] = [];
			const tempIds: string[] = [];
			const addData: Omit<DailyAssignment, 'id'>[] = [];
			const existingBySlotKey = new Map(
				getAssignmentSnapshot().map((assignment) => [
					assignmentSlotKey(assignment.date, assignment.assignmentTypeId),
					assignment
				])
			);

			for (const a of normalizedAssignments) {
				const existing = existingBySlotKey.get(assignmentSlotKey(a.date, a.assignmentTypeId));
				if (existing) existingIds.push(existing.id);

				if (a.assigneeId) {
					tempIds.push(`temp-${crypto.randomUUID()}`);
					addData.push({
						date: a.date,
						assignmentTypeId: a.assignmentTypeId,
						assigneeId: a.assigneeId
					});
				}
			}

			let removeMutationId: string | null = null;
			if (existingIds.length > 0) {
				removeMutationId = crypto.randomUUID();
				internals.log.push({ type: 'remove-batch', mutationId: removeMutationId, targetIds: existingIds });
			}

			let addMutationId: string | null = null;
			if (tempIds.length > 0) {
				addMutationId = crypto.randomUUID();
				internals.log.push({ type: 'add-batch', mutationId: addMutationId, tempIds, data: addData });
			}

			try {
				const { inserted } = await internals.withinOrganization(
					sendAssignments(
						'/batch',
						'POST',
						{ records: normalizedAssignments },
						'Failed to batch update assignments'
					).then((res) => res.json() as Promise<{ inserted: DailyAssignment[] }>)
				);

				const replacedSlots = new Set(normalizedAssignments.map((a) => assignmentSlotKey(a.date, a.assignmentTypeId)));
				internals.commit({
					deletedWhere: (assignment) =>
						replacedSlots.has(assignmentSlotKey(assignment.date, assignment.assignmentTypeId))
				});
				internals.commit({ saved: inserted });

				if (removeMutationId) internals.log.resolve(removeMutationId);
				if (addMutationId) internals.log.resolve(addMutationId);
				return true;
			} catch (error) {
				if (removeMutationId) internals.log.resolve(removeMutationId);
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

		getAssignmentsForGroup(groupId: string): DailyAssignment[] {
			return getAssignmentSnapshot().filter((a) => a.assigneeId === groupId);
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
