import { defineStore, stillInOrganizationLifetime } from '$lib/stores/core';
import type { Store, BatchApiAdapter } from '$lib/stores/core';
import type { AvailabilityEntry } from '$features/calendar/contracts';

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
			if (!res.ok) throw new Error('POST availability failed');
			return res.json();
		},

		async update(id, data) {
			const res = await fetch(url(), {
				method: 'PUT',
				headers,
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('PUT availability failed');
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
		 * counts. Throws only when nothing was inserted at all.
		 */
		async createBatch(items) {
			const inserted: AvailabilityEntry[] = [];
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
					if (!res.ok) continue;
					const data = await res.json();
					inserted.push(...(data.inserted ?? []));
				} catch {
					// A failed chunk must not abandon the remaining chunks.
				}
			}
			if (items.length > 0 && inserted.length === 0) throw new Error('Failed to add availability batch');
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
