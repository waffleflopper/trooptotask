import { browser } from '$app/environment';

const STORAGE_KEY = 'dashboard-prefs';

export type CardId = 'strength' | 'duty' | 'training' | 'upcoming' | 'ratings' | 'onboardings' | 'groups';

interface DashboardPrefs {
	cardOrder: CardId[];
	hiddenCards: CardId[];
}

const defaults: DashboardPrefs = {
	cardOrder: ['strength', 'duty', 'training', 'upcoming', 'ratings', 'onboardings', 'groups'],
	hiddenCards: []
};

const ALL_CARD_IDS = defaults.cardOrder;

class DashboardPrefsStore {
	#prefs = $state.raw<DashboardPrefs>({ ...defaults });

	constructor() {
		if (browser) {
			this.load();
		}
	}

	private load() {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				// Merge with defaults, ensuring any new cards are included
				const storedOrder: CardId[] = Array.isArray(parsed.cardOrder) ? parsed.cardOrder : [];
				const storedHidden: CardId[] = Array.isArray(parsed.hiddenCards) ? parsed.hiddenCards : [];
				// Add any new card IDs not in stored order
				const missing = ALL_CARD_IDS.filter((id) => !storedOrder.includes(id));
				this.#prefs = {
					cardOrder: [...storedOrder, ...missing].filter((id) => ALL_CARD_IDS.includes(id)),
					hiddenCards: storedHidden.filter((id) => ALL_CARD_IDS.includes(id))
				};
			}
		} catch {
			// Ignore parse errors, use defaults
		}
	}

	private save() {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#prefs));
		}
	}

	get cardOrder(): CardId[] {
		return this.#prefs.cardOrder;
	}

	get hiddenCards(): CardId[] {
		return this.#prefs.hiddenCards;
	}

	get visibleCards(): CardId[] {
		return this.#prefs.cardOrder.filter((id) => !this.#prefs.hiddenCards.includes(id));
	}

	isVisible(id: CardId): boolean {
		return !this.#prefs.hiddenCards.includes(id);
	}

	toggleCard(id: CardId) {
		if (this.#prefs.hiddenCards.includes(id)) {
			this.#prefs.hiddenCards = this.#prefs.hiddenCards.filter((c) => c !== id);
		} else {
			this.#prefs.hiddenCards = [...this.#prefs.hiddenCards, id];
		}
		this.save();
	}

	moveCard(id: CardId, direction: 'up' | 'down') {
		const order = [...this.#prefs.cardOrder];
		const idx = order.indexOf(id);
		if (idx === -1) return;
		const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
		if (targetIdx < 0 || targetIdx >= order.length) return;
		[order[idx], order[targetIdx]] = [order[targetIdx], order[idx]];
		this.#prefs.cardOrder = order;
		this.save();
	}

	resetDefaults() {
		this.#prefs = { ...defaults, cardOrder: [...defaults.cardOrder], hiddenCards: [] };
		this.save();
	}
}

export const dashboardPrefsStore = new DashboardPrefsStore();
