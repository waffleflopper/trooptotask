import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/forms', () => ({ applyAction: vi.fn() }));
vi.mock('$features/identity', () => ({ redirectToSensitiveActionStepUp: () => false }));

import { createInboxActions } from './inboxActions.svelte';

async function submit(
	actions: ReturnType<typeof createInboxActions>,
	result: { type: string; data?: Record<string, unknown> }
) {
	const after = actions.enhanceFor('approve')({ cancel: () => {} } as never) as unknown as (input: {
		result: never;
	}) => Promise<void>;
	await after({ result: result as never });
}

describe('Inbox item commands', () => {
	it('tells the operator when an approval was recorded but its setup email was not sent', async () => {
		const settled = vi.fn();
		const actions = createInboxActions(settled);

		await submit(actions, { type: 'success', data: { success: true, setupDeliveryStatus: 'failed' } });

		expect(actions.notice).toBeTruthy();
		expect(actions.error).toBeNull();
		expect(settled).toHaveBeenCalledWith(true);
	});

	it('shows no notice when the setup email went out, and clears an earlier one on the next command', async () => {
		const actions = createInboxActions(() => {});
		await submit(actions, { type: 'success', data: { setupDeliveryStatus: 'failed' } });
		expect(actions.notice).toBeTruthy();

		await submit(actions, { type: 'success', data: { setupDeliveryStatus: 'sent' } });

		expect(actions.notice).toBeNull();
	});

	it('keeps a send that already went out from reading as a failed send', async () => {
		const settled = vi.fn();
		const actions = createInboxActions(settled);

		await submit(actions, {
			type: 'failure',
			data: { error: 'The setup email was sent, but the audit failed. Reload before sending again.', emailSent: true }
		});

		expect(actions.notice).toContain('Reload before sending again');
		expect(actions.error).toBeNull();
		expect(settled).toHaveBeenCalledWith(false);
	});

	it('reports an ordinary failure as an error', async () => {
		const actions = createInboxActions(() => {});

		await submit(actions, { type: 'failure', data: { error: 'Already closed elsewhere.' } });

		expect(actions.error).toBe('Already closed elsewhere.');
		expect(actions.notice).toBeNull();
	});

	it('confirms a command that took effect and forgets it on the next command', async () => {
		const actions = createInboxActions(() => {});

		await submit(actions, { type: 'success', data: { success: true, action: 'resendSetup' } });
		expect(actions.confirmation).toBeTruthy();

		await submit(actions, { type: 'failure', data: { error: 'Nope.' } });
		expect(actions.confirmation).toBeNull();
	});
});
