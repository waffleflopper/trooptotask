import { createStore } from '$lib/stores/core';
import type { BatchApiAdapter } from '$lib/stores/core';
import type { AvailabilityEntry } from '../calendar.types';
import { isDateInRange, formatDate } from '$lib/utils/dates';

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

		async createBatch(items) {
			const res = await fetch(`${url()}/batch`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ records: items })
			});
			if (!res.ok) throw new Error('Failed to add availability batch');
			const data = await res.json();
			return data.inserted;
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

const store = createStore<AvailabilityEntry>({
	resource: 'availability',
	adapter: batchAdapter,
	batchAdapter
});

export const availabilityStore = {
	get list() {
		return store.items;
	},
	load(items: AvailabilityEntry[], orgId: string) {
		orgIdRef = orgId;
		store.load(items, orgId);
	},
	add: store.add,
	remove: store.removeBool,

	addBatch: store.addBatch,
	removeBatch: store.removeBatch,

	removeByPersonnelLocal: (personnelId: string) => store.removeLocalWhere((e) => e.personnelId === personnelId),

	removeByStatusTypeLocal: (statusTypeId: string) => store.removeLocalWhere((e) => e.statusTypeId === statusTypeId),

	getById: (id: string) => store.getById(id),
	getByPersonnel: (personnelId: string) => store.filter((e) => e.personnelId === personnelId),

	getByPersonnelAndDate: (personnelId: string, date: Date) =>
		store.filter((e) => e.personnelId === personnelId && isDateInRange(date, e.startDate, e.endDate)),

	getByDate: (date: Date) => store.filter((e) => isDateInRange(date, e.startDate, e.endDate)),

	getByDateRange(startDate: Date, endDate: Date) {
		const start = formatDate(startDate);
		const end = formatDate(endDate);
		return store.filter(
			(e) =>
				(e.startDate >= start && e.startDate <= end) ||
				(e.endDate >= start && e.endDate <= end) ||
				(e.startDate <= start && e.endDate >= end)
		);
	}
};
