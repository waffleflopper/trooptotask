import { defineStore } from '$lib/stores/core';
import type { Store, BatchApiAdapter } from '$lib/stores/core';
import type { AvailabilityEntry } from '$lib/types';
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
			return base.filter(
				(e) =>
					(e.startDate >= start && e.startDate <= end) ||
					(e.endDate >= start && e.endDate <= end) ||
					(e.startDate <= start && e.endDate >= end)
			);
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
