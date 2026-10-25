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
});
