import { isFeatureKey, type FeatureKey } from '$lib/access/featureSwitches';
import { getBrowserLocalStorage } from '$lib/utils/browserStorage';
import type { SetupHint } from './sections/dashboardSections';

interface HintOwner {
	orgId: string;
	userId: string;
}

const keyFor = ({ orgId, userId }: HintOwner) => `t2t:dashboard-setup-hints:${orgId}:${userId}`;

/** None when the browser cannot store, or the stored value is unreadable or malformed. */
function readDismissed(owner: HintOwner): FeatureKey[] {
	try {
		const parsed: unknown = JSON.parse(getBrowserLocalStorage()?.getItem(keyFor(owner)) ?? '[]');
		return Array.isArray(parsed) ? parsed.filter(isFeatureKey) : [];
	} catch {
		return [];
	}
}

/**
 * The setup hints a member dismissed for a unit, remembered in this browser. A browser that cannot store
 * keeps a hint dismissed only until the page reloads.
 */
export class SetupHintDismissals {
	#owner: () => HintOwner;
	#dismissedNow = $state.raw<{ key: string; features: readonly FeatureKey[] } | null>(null);
	#dismissed = $derived.by(() => {
		const owner = this.#owner();
		return this.#dismissedNow?.key === keyFor(owner) ? this.#dismissedNow.features : readDismissed(owner);
	});

	constructor(owner: () => HintOwner) {
		this.#owner = owner;
	}

	visible(hints: readonly SetupHint[]): SetupHint[] {
		return hints.filter((hint) => !this.#dismissed.includes(hint.feature));
	}

	dismiss(feature: FeatureKey): void {
		const key = keyFor(this.#owner());
		const features = [...this.#dismissed, feature];
		this.#dismissedNow = { key, features };
		try {
			getBrowserLocalStorage()?.setItem(key, JSON.stringify(features));
		} catch {
			return;
		}
	}
}
