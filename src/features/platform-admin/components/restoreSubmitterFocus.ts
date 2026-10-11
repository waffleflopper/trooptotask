import { tick } from 'svelte';

// A pressed button disables while its write and re-read run, which drops focus to the page.
export async function restoreSubmitterFocus(
	submitter: HTMLElement | null,
	fallback: () => HTMLElement | null | undefined
) {
	await tick();
	if (document.activeElement && document.activeElement !== document.body) return;
	const pressed = submitter instanceof HTMLButtonElement && submitter.isConnected && !submitter.disabled;
	(pressed ? submitter : fallback())?.focus();
}
