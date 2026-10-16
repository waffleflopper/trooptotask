/**
 * Availability store — per-personnel availability entries for the visible calendar range.
 *
 * Extends the base store with a custom `BatchApiAdapter` so that bulk set/clear operations
 * hit the `/api/availability` batch endpoint instead of individual CRUD routes.
 *
 * Key extended methods:
 * - `getByPersonnelAndDate(personnelId, date)` — fast lookup for a single cell
 * - `getByDate(date)` — all entries for a given day
 * - `setBulk(personnelIds, dateRange, statusTypeId)` — batch set for multiple people
 * - `clearBulk(personnelIds, dateRange)` — batch clear
 *
 * Loaded by the calendar page load function and populated from the server response.
 */
import { buildRequestError, defineStore, stillInOrganizationLifetime } from '$lib/stores/core';
import type { Store, BatchApiAdapter } from '$lib/stores/core';
import type { AvailabilityEntry } from '$features/calendar/contracts';
import { isDateInRange, formatDate } from '$lib/utils/dates';
import { rangesOverlap } from '$features/calendar/utils/availabilityMutation';

let orgIdRef = '';

/** Records per request for chunked batch creation; large imports submit in slices this size. */
const CREATE_BATCH_CHUNK_SIZE = 500;

function createAvailabilityBatchAdapter(): BatchApiAdapter<AvailabilityEntry> {
	const headers = { 'Content-Type': 'application/json' };
	function url() {
		return `/org/${orgIdRef}/api/availability`;
	}

	return {
		async create(data) {
			const res = await fetch(url(), {
				method: 'POST',
				headers,
				body: JSON.stringify(data)
			});
			if (!res.ok) throw await buildRequestError(res, 'POST', 'availability');
			return res.json();
		},

		async update(id, data) {
			const res = await fetch(url(), {
				method: 'PUT',
				headers,
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw await buildRequestError(res, 'PUT', 'availability');
			return res.json();
		},

		async remove(id) {
			try {
				const res = await fetch(url(), {
					method: 'DELETE',
					headers,
					body: JSON.stringify({ id })
				});

				if (res.status === 202) {
					const body = await res.json();
					if (body.requiresApproval) {
						return 'approval_required';
					}
				}

				if (!res.ok) return 'error';
				return 'deleted';
			} catch {
				return 'error';
			}
		},

		/**
		 * Chunked batch create. Keeps going past a failed chunk and returns the entries that
		 * made it in, so callers detect partial failure by comparing attempted and inserted
		 * counts. Throws the first chunk's failure only when nothing was inserted at all.
		 */
		async createBatch(items) {
			const inserted: AvailabilityEntry[] = [];
			let firstFailure: unknown = null;
			const organizationId = orgIdRef;
			const sameLifetime = stillInOrganizationLifetime();
			for (let i = 0; i < items.length; i += CREATE_BATCH_CHUNK_SIZE) {
				// Later chunks belong to the Organization lifetime that started the import.
				if (!sameLifetime() || orgIdRef !== organizationId) break;
				const chunk = items.slice(i, i + CREATE_BATCH_CHUNK_SIZE);
				try {
					const res = await fetch(`/org/${organizationId}/api/availability/batch`, {
						method: 'POST',
						headers,
						body: JSON.stringify({ records: chunk })
					});
					if (!res.ok) throw await buildRequestError(res, 'POST', 'availability/batch');
					const data = await res.json();
					inserted.push(...(data.inserted ?? []));
				} catch (failure) {
					// A failed chunk must not abandon the remaining chunks.
					firstFailure ??= failure;
				}
			}
			if (items.length > 0 && inserted.length === 0)
				throw firstFailure ?? new Error('Failed to add availability batch');
			return inserted;
		},

		async removeBatch(ids) {
			const res = await fetch(`${url()}/batch`, {
				method: 'DELETE',
				headers,
				body: JSON.stringify({ ids })
			});
			if (!res.ok) throw new Error('Failed to delete availability batch');
			return true;
		}
	};
}

const batchAdapter = createAvailabilityBatchAdapter();

interface AvailabilityExtensions extends Record<string, unknown> {
	load: (items: AvailabilityEntry[], orgId: string) => void;
	remove: (id: string) => Promise<boolean>;
	removeByPersonnelLocal: (personnelId: string) => void;
	removeByStatusTypeLocal: (statusTypeId: string) => void;
	getByPersonnel: (personnelId: string) => AvailabilityEntry[];
	getByPersonnelAndDate: (personnelId: string, date: Date) => AvailabilityEntry[];
	getByDate: (date: Date) => AvailabilityEntry[];
	getByDateRange: (startDate: Date, endDate: Date) => AvailabilityEntry[];
}

function enhance(base: Store<AvailabilityEntry>): AvailabilityExtensions {
	return {
		load(items: AvailabilityEntry[], orgId: string) {
			orgIdRef = orgId;
			base.load(items, orgId);
		},

		remove: base.removeBool,

		removeByPersonnelLocal: (personnelId: string) => base.removeLocalWhere((e) => e.personnelId === personnelId),

		removeByStatusTypeLocal: (statusTypeId: string) => base.removeLocalWhere((e) => e.statusTypeId === statusTypeId),

		getByPersonnel: (personnelId: string) => base.filter((e) => e.personnelId === personnelId),

		getByPersonnelAndDate: (personnelId: string, date: Date) =>
			base.filter((e) => e.personnelId === personnelId && isDateInRange(date, e.startDate, e.endDate)),

		getByDate: (date: Date) => base.filter((e) => isDateInRange(date, e.startDate, e.endDate)),

		getByDateRange(startDate: Date, endDate: Date) {
			const start = formatDate(startDate);
			const end = formatDate(endDate);
			return base.filter((e) => rangesOverlap(e.startDate, e.endDate, start, end));
		}
	};
}

export const availabilityStore = defineStore<AvailabilityEntry, AvailabilityExtensions>(
	{
		table: 'availability',
		overrides: {
			adapter: batchAdapter,
			batchAdapter
		}
	},
	enhance
);
