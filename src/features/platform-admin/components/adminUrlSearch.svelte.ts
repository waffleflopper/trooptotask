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
	let draft = $state<{ text: string; base: string } | null>(null);
	let typing = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => clearTimeout(timer));

	$effect.pre(() => {
		if (draft && !typing && committed() !== draft.base) draft = null;
	});

	return {
		get value() {
			return draft ? draft.text : committed();
		},
		setValue(next) {
			draft = { text: next, base: committed() };
			typing = true;
			clearTimeout(timer);
			timer = setTimeout(() => {
				typing = false;
				draft = { text: next, base: committed() };
				commit(next);
			}, delayMs);
		}
	};
}
