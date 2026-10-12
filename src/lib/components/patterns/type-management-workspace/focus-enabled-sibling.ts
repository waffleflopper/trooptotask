import { tick } from 'svelte';

/** A move button that reaches the end of its list disables; hand focus to its enabled sibling instead of dropping it to the page. */
export async function focusEnabledSibling(pressed: HTMLElement) {
	await tick();
	if (!pressed.matches(':disabled')) return;
	pressed.parentElement?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
}
