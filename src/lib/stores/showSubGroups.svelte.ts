import { getBrowserLocalStorage } from '$lib/utils/browserStorage';

/** The head script in `app.html` reads the same key. */
const STORAGE_KEY = 't2t:show-sub-groups';

/**
 * Whether Group-aware screens show sub-groups, remembered on this device for every screen and Organization. The server
 * and hydration render the default; `init()` in the root layout's `onMount` reads the device's choice. Rows that render
 * on the server carry `data-sub-group-row`, which the head script hides until then.
 */
export class ShowSubGroupsPreference {
	#show = $state(true);
	readonly #storage: () => Storage | null;

	constructor(storage: () => Storage | null = getBrowserLocalStorage) {
		this.#storage = storage;
	}

	get current(): boolean {
		return this.#show;
	}

	init(): void {
		try {
			this.#show = this.#storage()?.getItem(STORAGE_KEY) !== 'false';
		} catch {
			this.#show = true;
		}
		this.#applyToDocument();
	}

	set(show: boolean): void {
		this.#show = show;
		try {
			this.#storage()?.setItem(STORAGE_KEY, String(show));
		} catch {
			// A browser that cannot store keeps the choice until the page reloads.
		}
		this.#applyToDocument();
	}

	#applyToDocument(): void {
		if (typeof document !== 'undefined') {
			document.documentElement.toggleAttribute('data-sub-groups-hidden', !this.#show);
		}
	}
}

export const showSubGroups = new ShowSubGroupsPreference();

/** The one switch every Group-aware screen puts in its Display menu, shaped as a workspace toolbar menu toggle. */
export function showSubGroupsToggle(preference: ShowSubGroupsPreference = showSubGroups) {
	return {
		kind: 'toggle' as const,
		id: 'show-sub-groups',
		label: 'Show sub-groups',
		pressed: preference.current,
		onPressedChange: (pressed: boolean) => preference.set(pressed)
	};
}
