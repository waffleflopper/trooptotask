/**
 * Availability store: the entries for the loaded calendar range. Its adapter writes through the
 * Organization's `api/availability` routes and sends bulk creation and removal to their `batch` route.
 */
import { buildRequestError, defineStore, stillInOrganizationLifetime } from '$lib/stores/core';
import type { Store, BatchApiAdapter } from '$lib/stores/core';
import { z } from 'zod';
import { AVAILABILITY_BATCH_LIMIT, type AvailabilityEntry } from '$features/calendar/contracts';

const removalReplySchema = z.object({ deleted: z.number().int().nonnegative() });

let orgIdRef = '';

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
			for (let i = 0; i < items.length; i += AVAILABILITY_BATCH_LIMIT) {
				// Later chunks belong to the Organization lifetime that started the import.
				if (!sameLifetime() || orgIdRef !== organizationId) break;
				const chunk = items.slice(i, i + AVAILABILITY_BATCH_LIMIT);
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
			const completedIds: string[] = [];
			let deleted = 0;
			let failure: unknown = null;
			const organizationId = orgIdRef;
			const sameLifetime = stillInOrganizationLifetime();
			for (let i = 0; i < ids.length; i += AVAILABILITY_BATCH_LIMIT) {
				if (!sameLifetime() || orgIdRef !== organizationId) break;
				const chunk = ids.slice(i, i + AVAILABILITY_BATCH_LIMIT);
				try {
					const res = await fetch(`/org/${organizationId}/api/availability/batch`, {
						method: 'DELETE',
						headers,
						body: JSON.stringify({ ids: chunk })
					});
					if (!res.ok) throw await buildRequestError(res, 'DELETE', 'availability/batch');
					deleted += removalReplySchema.parse(await res.json()).deleted;
					completedIds.push(...chunk);
				} catch (e) {
					failure = e;
					break;
				}
			}
			if (ids.length > 0 && completedIds.length === 0)
				throw failure ?? new Error('Failed to remove availability batch');
			return { deleted, completedIds };
		}
	};
}

const batchAdapter = createAvailabilityBatchAdapter();

interface AvailabilityExtensions extends Record<string, unknown> {
	load: (items: AvailabilityEntry[], orgId: string) => void;
	remove: (id: string) => Promise<boolean>;
	removeByStatusTypeLocal: (statusTypeId: string) => void;
}

function enhance(base: Store<AvailabilityEntry>): AvailabilityExtensions {
	return {
		load(items: AvailabilityEntry[], orgId: string) {
			orgIdRef = orgId;
			base.load(items, orgId);
		},

		remove: base.removeBool,

		removeByStatusTypeLocal: (statusTypeId: string) => base.removeLocalWhere((e) => e.statusTypeId === statusTypeId)
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
