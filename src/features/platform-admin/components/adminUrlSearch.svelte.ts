import { onDestroy } from 'svelte';

export type AdminUrlSearch = {
	readonly value: string;
	setValue(next: string): void;
};

export function createAdminUrlSearch(
	committed: () => string,
	commit: (value: string) => void,
	delayMs = 300
): AdminUrlSearch {
	let draft = $state<{ text: string; base: string; landed: boolean } | null>(null);
	let typing = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => clearTimeout(timer));

	// A server may trim the committed value, so the draft counts as landed when the URL holds it trimmed or not.
	// The next URL change after that (Back, a sidebar link) is someone else's value and replaces the draft.
	$effect.pre(() => {
		if (!draft || typing) return;
		const current = committed();
		if (current === draft.text || current === draft.text.trim()) {
			if (!draft.landed) draft.landed = true;
		} else if (draft.landed || current !== draft.base) {
			draft = null;
		}
	});

	return {
		get value() {
			return draft ? draft.text : committed();
		},
		setValue(next) {
			draft = { text: next, base: committed(), landed: false };
			typing = true;
			clearTimeout(timer);
			timer = setTimeout(() => {
				typing = false;
				draft = { text: next, base: committed(), landed: false };
				commit(next);
			}, delayMs);
		}
	};
}
