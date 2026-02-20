export interface RosterHistoryEntry {
	date: string;
	assigneeId: string | null;
	assigneeName: string | null;
	assigneeRank: string | null;
	assigneeGroup: string | null;
	reason?: string;
}

export interface RosterHistoryItem {
	id: string;
	assignmentTypeId: string;
	name: string;
	startDate: string;
	endDate: string;
	roster: RosterHistoryEntry[];
	config: Record<string, unknown>;
	createdAt: string;
}

class DutyRosterHistoryStore {
	#items = $state<RosterHistoryItem[]>([]);

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
