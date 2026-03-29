/**
 * Duty roster history types and store — past roster generation runs for the org.
 *
 * Exports:
 * - `RosterHistoryEntry` — a single slot assignment row within a generated roster
 * - `DA6Data` — the formatted roster structure used for the DA-6 style display
 * - `RosterHistoryItem` — top-level record for a roster run (dates, config, generated data)
 * - `dutyRosterHistoryStore` — the `defineStore` instance for `duty_roster_history` rows
 *
 * The store is read-only from the UI; rows are written by the duty-roster generator.
 * Loaded by the duty roster page load function via `rosterHistoryQuery.ts`.
 */
export interface RosterHistoryEntry {
	date: string;
	assigneeId: string | null;
	assigneeName: string | null;
	assigneeRank: string | null;
	assigneeGroup: string | null;
	reason?: string;
}

export interface DA6Data {
	personnel: { id: string; name: string; rank: string; group: string }[];
	dates: { date: string; positions: (number | null)[] }[];
}

export interface RosterHistoryItem {
	id: string;
	assignmentTypeId: string;
	name: string;
	startDate: string;
	endDate: string;
	roster: RosterHistoryEntry[];
	da6?: DA6Data;
	config: Record<string, unknown>;
	createdAt: string;
}

class DutyRosterHistoryStore {
	#items = $state.raw<RosterHistoryItem[]>([]);

	get items() {
		return this.#items;
	}

	load(items: RosterHistoryItem[]) {
		this.#items = items;
	}

	add(item: RosterHistoryItem) {
		this.#items = [item, ...this.#items];
	}

	remove(id: string) {
		this.#items = this.#items.filter((i) => i.id !== id);
	}
}

export const dutyRosterHistoryStore = new DutyRosterHistoryStore();
