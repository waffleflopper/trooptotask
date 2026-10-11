import { tick } from 'svelte';
import type { ActionResult } from '@sveltejs/kit';

export interface ActionOutcome {
	result: ActionResult;
	update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
}

export interface SettleOptions {
	/**
	 * Whether the view that sent the request still owns its result. SvelteKit runs a `use:enhance` callback
	 * after the form is destroyed, so a response that arrives once this is false changes nothing.
	 */
	isCurrent: () => boolean;
	/**
	 * Applies the outcome to the view: receives the in-context error message (null unless the result was an
	 * unexpected error) and ends busy state. Runs after the result applies, also when `update` rejects, and
	 * before focus moves, so the message renders and a re-enabled control can take focus.
	 */
	settled: (error: string | null) => void;
	/** Focus candidates, tried in order once the result renders. Return the initiating control first. */
	focus: () => ReadonlyArray<HTMLElement | null | undefined>;
}

const UNEXPECTED_ERROR_MESSAGE = "The request didn't complete. Try again.";

/**
 * Settles a `use:enhance` result in place. An unexpected error yields a message for an in-context Alert instead
 * of replacing the page with the error page, so drafts survive. Success, failure and redirect go through
 * SvelteKit's `update`. Focus then returns to the first usable candidate, scrolled into view, rather than the
 * document body, where SvelteKit leaves it after a success or a navigation. A redirect to another page leaves
 * no candidate, so that page keeps SvelteKit's navigation focus and route announcement.
 */
export async function settleAction(
	{ result, update }: ActionOutcome,
	{ isCurrent, settled, focus }: SettleOptions
): Promise<void> {
	if (!isCurrent()) return;
	try {
		if (result.type !== 'error') await update();
	} finally {
		if (isCurrent()) settled(result.type === 'error' ? UNEXPECTED_ERROR_MESSAGE : null);
	}
	await tick();
	if (!isCurrent()) return;
	const target = focus().find(canTakeFocus);
	target?.focus();
	// A control that kept focus while pending does not scroll on focus(), but the result may have moved it.
	target?.scrollIntoView({ block: 'nearest' });
}

// A focused control that becomes disabled stays `document.activeElement` in Chrome, so disabled counts as lost.
function canTakeFocus(element: HTMLElement | null | undefined): element is HTMLElement {
	return !!element && element.isConnected && !element.matches(':disabled');
}
