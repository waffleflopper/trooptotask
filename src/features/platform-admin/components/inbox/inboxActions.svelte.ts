import { applyAction } from '$app/forms';
import type { SubmitFunction } from '@sveltejs/kit';
import { redirectToSensitiveActionStepUp } from '$features/identity';

const UNEXPECTED_ERROR = "The request didn't complete. Reload this item to see where it stands before trying again.";

/**
 * Runs an Inbox item's form actions one at a time. Any settled result asks the Inbox to re-read, because a failure
 * can follow a write that already took effect. A result that arrives after `dispose` changes nothing.
 */
export function createInboxActions(onSettled: (succeeded: boolean) => void) {
	let pending = $state<string | null>(null);
	let steppingUp = $state(false);
	let error = $state<string | null>(null);
	let run = 0;

	function enhanceFor(name: string): SubmitFunction {
		return ({ cancel }) => {
			if (pending) {
				cancel();
				return;
			}
			const mine = ++run;
			pending = name;
			error = null;
			return async ({ result }) => {
				if (mine !== run) return;
				if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) {
					steppingUp = true;
					return;
				}
				if (result.type === 'redirect') {
					pending = null;
					await applyAction(result);
					return;
				}
				pending = null;
				if (result.type === 'failure') {
					const message = (result.data as { error?: unknown } | undefined)?.error;
					error = typeof message === 'string' ? message : UNEXPECTED_ERROR;
				} else if (result.type === 'error') error = UNEXPECTED_ERROR;
				onSettled(result.type === 'success');
			};
		};
	}

	return {
		enhanceFor,
		get pending() {
			return pending;
		},
		get steppingUp() {
			return steppingUp;
		},
		get error() {
			return error;
		},
		/** Ends the wait after the person abandons the step-up and comes back. */
		resumeAfterStepUp() {
			steppingUp = false;
			pending = null;
			error = 'Multi-factor verification was not completed. Try again when you are ready.';
		},
		dispose() {
			run++;
		}
	};
}
