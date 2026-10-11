import { tick } from 'svelte';
import type { ActionResult } from '@sveltejs/kit';

export interface ActionOutcome {
	result: ActionResult;
	update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
}

export interface SettleOptions {
	/** Focus candidates, tried in order once the result renders. Return the initiating control first. */
	focus: () => ReadonlyArray<HTMLElement | null | undefined>;
	/** Ends busy state after the result applies and before focus moves, so a re-enabled control can take it. */
	settled?: () => void;
}

const UNEXPECTED_ERROR_MESSAGE = "The request didn't complete. Your entries are still here. Try again.";

/**
 * Settles a `use:enhance` result in place. A redirect goes to SvelteKit. An unexpected error returns a
 * message for an in-context Alert instead of replacing the page with the error page, so drafts survive.
 * Success and failure apply as usual, then focus returns to the first usable candidate rather than the
 * document body, where SvelteKit's `applyAction` leaves it after a success.
 */
export async function settleAction(
	{ result, update }: ActionOutcome,
	{ focus, settled }: SettleOptions
): Promise<string | null> {
	if (result.type !== 'error') await update();
	settled?.();
	if (result.type === 'redirect') return null;
	await tick();
	focus().find(canTakeFocus)?.focus();
	return result.type === 'error' ? UNEXPECTED_ERROR_MESSAGE : null;
}

// A focused control that becomes disabled stays `document.activeElement` in Chrome, so disabled counts as lost.
function canTakeFocus(element: HTMLElement | null | undefined): element is HTMLElement {
	return !!element && element.isConnected && !element.matches(':disabled');
}
