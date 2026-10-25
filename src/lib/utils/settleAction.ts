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
	 * Applies the outcome to the view: receives the in-context error message and ends busy state. The message is
	 * null only when the result applied cleanly; gate success-only effects (closing a sheet, clearing a draft) on
	 * it. Runs before focus moves, so the message renders and a re-enabled control can take focus.
	 */
	settled: (error: string | null) => void;
	/** Focus candidates, tried in order once the result renders. Return the initiating control first. */
	focus: () => ReadonlyArray<HTMLElement | null | undefined>;
	/** Pass false when the view owns its field values, so SvelteKit's form reset does not blank them. */
	reset?: boolean;
}

const UNEXPECTED_ERROR_MESSAGE = "The request didn't complete. Try again.";
// The request may already have taken effect, so this asks for a reload rather than a retry.
const REFRESH_FAILED_MESSAGE = "The page couldn't refresh after this request. Reload to see the current state.";

/**
 * Settles a `use:enhance` result in place. An unexpected error yields a message for an in-context Alert instead
 * of replacing the page with the error page, so drafts survive. Success, failure and redirect go through
 * SvelteKit's `update`. Focus then returns to the first usable candidate, scrolled into view, rather than the
 * document body, where SvelteKit leaves it after a success or a navigation. A redirect to another page leaves
 * no candidate, so that page keeps SvelteKit's navigation focus and route announcement.
 */
export async function settleAction(
	{ result, update }: ActionOutcome,
	{ isCurrent, settled, focus, reset }: SettleOptions
): Promise<void> {
	if (!isCurrent()) return;
	let error = result.type === 'error' ? UNEXPECTED_ERROR_MESSAGE : null;
	if (result.type !== 'error') {
		try {
			await update(reset === undefined ? undefined : { reset });
		} catch {
			error = REFRESH_FAILED_MESSAGE;
		}
	}
	if (!isCurrent()) return;
	settled(error);
	await tick();
	if (!isCurrent()) return;
	restoreFocus(focus());
}

/**
 * Focuses the first candidate that takes focus, scrolled into view. A control in a hidden panel refuses focus, so
 * the next candidate gets it.
 */
export function restoreFocus(candidates: ReadonlyArray<HTMLElement | null | undefined>): void {
	for (const target of candidates) {
		if (!canTakeFocus(target)) continue;
		target.focus();
		if (document.activeElement !== target) continue;
		// A control that kept focus while pending does not scroll on focus(), but the result may have moved it.
		target.scrollIntoView({ block: 'nearest' });
		return;
	}
}

// A focused control that becomes disabled stays `document.activeElement` in Chrome, so disabled counts as lost.
function canTakeFocus(element: HTMLElement | null | undefined): element is HTMLElement {
	return !!element && element.isConnected && !element.matches(':disabled');
}
