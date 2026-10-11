import { tick } from 'svelte';

// A pressed button disables while its write and re-read run, which drops focus to the page.
// Targets that left the page or sit in a hidden panel refuse focus, so the first one that takes it wins.
export async function restoreSubmitterFocus(
	submitter: HTMLElement | null,
	fallbacks: () => (HTMLElement | null | undefined)[]
) {
	await tick();
	if (document.activeElement && document.activeElement !== document.body) return;
	const pressed = submitter instanceof HTMLButtonElement && submitter.isConnected && !submitter.disabled;
	for (const target of [pressed ? submitter : null, ...fallbacks()]) {
		target?.focus();
		if (target && document.activeElement === target) return;
	}
}
