import type { AvailabilityEntry, StatusType } from '$lib/types';
import { formatDate, parseDate } from '$lib/utils/dates';

interface AvailabilityStatusIndexInput {
	availabilityEntries: AvailabilityEntry[];
	statusTypes: StatusType[];
	dateKeys: string[];
}

export interface AvailabilityStatusIndex {
	getStatus: (personnelId: string, dateKey: string) => StatusType | undefined;
}

function nextLocalDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

export function buildAvailabilityStatusIndex({
	availabilityEntries,
	statusTypes,
	dateKeys
}: AvailabilityStatusIndexInput): AvailabilityStatusIndex {
	const visibleDateKeys = new Set(dateKeys);
	const firstVisibleDate = dateKeys[0];
	const lastVisibleDate = dateKeys.at(-1);
	const statusTypeById = new Map(statusTypes.map((statusType) => [statusType.id, statusType]));
	const statusByPersonnelDate = new Map<string, StatusType>();

	if (!firstVisibleDate || !lastVisibleDate) {
		return {
			getStatus: () => undefined
		};
	}

	for (const entry of availabilityEntries) {
		const statusType = statusTypeById.get(entry.statusTypeId);
		if (!statusType) continue;

		const startDate = entry.startDate > firstVisibleDate ? entry.startDate : firstVisibleDate;
		const endDate = entry.endDate < lastVisibleDate ? entry.endDate : lastVisibleDate;
		if (startDate > endDate) continue;

		for (let date = parseDate(startDate); ; date = nextLocalDay(date)) {
			const dateKey = formatDate(date);
			if (dateKey > endDate) break;
			if (!visibleDateKeys.has(dateKey)) continue;
			statusByPersonnelDate.set(`${entry.personnelId}:${dateKey}`, statusType);
		}
	}

	return {
		getStatus: (personnelId, dateKey) => statusByPersonnelDate.get(`${personnelId}:${dateKey}`)
	};
}
