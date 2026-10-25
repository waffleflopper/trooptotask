import { applyAction } from '$app/forms';
import type { SubmitFunction } from '@sveltejs/kit';
import { redirectToSensitiveActionStepUp } from '$features/identity';

const SETUP_NOT_SENT = 'Approved, but the setup email could not be sent, so the person has not received a link.';
const CONFIRMATIONS: Record<string, string> = {
	resendSetup: 'A new setup link was sent.',
	rescindAccess: 'Access was rescinded.',
	askInviter: 'The inviter was notified. This item stays open until the address is fixed.'
};
const UNEXPECTED_ERROR = "The request didn't complete. Reload this item to see where it stands before trying again.";

/**
 * Runs an Inbox item's form actions one at a time. Any settled result asks the Inbox to re-read, because a failure
 * can follow a write that already took effect. A result that arrives after `dispose` changes nothing.
 */
export function createInboxActions(onSettled: (succeeded: boolean) => void) {
	let pending = $state<string | null>(null);
	let steppingUp = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let confirmation = $state<string | null>(null);
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
			notice = null;
			confirmation = null;
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
					const data = result.data as { error?: unknown; emailSent?: unknown; notificationSent?: unknown } | undefined;
					const message = typeof data?.error === 'string' ? data.error : UNEXPECTED_ERROR;
					// The email or notification already went out: this is not a failed send, and a retry would send twice.
					if (data?.emailSent === true || data?.notificationSent === true) notice = message;
					else error = message;
				} else if (result.type === 'error') error = UNEXPECTED_ERROR;
				else if (result.type === 'success') {
					const delivery = (result.data as { setupDeliveryStatus?: unknown } | undefined)?.setupDeliveryStatus;
					if (delivery === 'failed') notice = SETUP_NOT_SENT;
					const done = result.data as { action?: unknown; message?: unknown } | undefined;
					if (typeof done?.action === 'string') confirmation = CONFIRMATIONS[done.action] ?? null;
					else if (typeof done?.message === 'string') confirmation = done.message;
				}
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
		/** A command took effect but something the person needs to know about did not complete. */
		get notice() {
			return notice;
		},
		/** What a command that took effect did, in a sentence. */
		get confirmation() {
			return confirmation;
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
