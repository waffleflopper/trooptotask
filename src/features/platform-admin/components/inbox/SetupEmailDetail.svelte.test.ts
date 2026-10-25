// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import type { InboxDetailOf } from '../../inboxTypes';

const forms = vi.hoisted(() => ({ submits: [] as SubmitFunction[] }));
vi.mock('$app/forms', () => ({
	applyAction: vi.fn(),
	enhance: (_form: HTMLFormElement, submit: SubmitFunction) => {
		forms.submits.push(submit);
		return { destroy: () => {} };
	}
}));
vi.mock('$features/identity', () => ({ redirectToSensitiveActionStepUp: () => false }));

import SetupEmailDetail from './SetupEmailDetail.svelte';

const detail = (overrides: Partial<InboxDetailOf<'setupEmailFailed'>> = {}): InboxDetailOf<'setupEmailFailed'> => ({
	kind: 'setupEmailFailed',
	canAskInviter: true,
	timeline: [
		{
			id: 'link-1',
			created_at: '2026-10-20T08:00:00Z',
			expires_at: '2026-11-03T08:00:00Z',
			claimed_at: null,
			used_at: null,
			failed_at: null,
			failure_reason: null,
			revoked_at: null,
			revocation_reason: null,
			bounced_at: '2026-10-20T08:01:00Z',
			bounce_reason: 'mailbox does not exist',
			deliveries: []
		}
	],
	isOpen: true,
	id: 'link-1',
	requestId: 'request-1',
	name: 'Sam Rivera',
	email: 'sam@exmaple.test',
	reason: 'bounced',
	failedAt: '2026-10-20T08:01:00Z',
	closedAt: null,
	bounceReason: 'mailbox does not exist',
	expiresAt: '2026-11-03T08:00:00Z',
	createdAt: '2026-10-20T08:00:00Z',
	claimedAt: null,
	revokedAt: null,
	completedAt: null,
	status: 'approved',
	...overrides
});

const commands = () => screen.queryAllByRole('button');
const askButton = () => screen.getByRole('button', { name: /Ask the inviter/ }) as HTMLButtonElement;

beforeEach(() => {
	forms.submits = [];
});
afterEach(cleanup);

describe('Setup email Inbox detail', () => {
	it('lets the operator ask the inviter when a member invited the address', () => {
		render(SetupEmailDetail, { props: { detail: detail(), onChanged: () => {} } });

		expect(askButton().disabled).toBe(false);
		expect((screen.getByRole('button', { name: 'Resend setup link' }) as HTMLButtonElement).disabled).toBe(false);
		expect(screen.getByRole('button', { name: 'Rescind access' })).toBeTruthy();
	});

	it('cannot ask an inviter nobody can be asked', () => {
		render(SetupEmailDetail, { props: { detail: detail({ canAskInviter: false }), onChanged: () => {} } });

		expect(askButton().disabled).toBe(true);
	});

	it('warns that resending to a bounced address usually bounces again', () => {
		render(SetupEmailDetail, { props: { detail: detail(), onChanged: () => {} } });

		expect(screen.getByText(/resending usually bounces again/)).toBeTruthy();
	});

	it('leaves a resolved item with no commands', () => {
		render(SetupEmailDetail, {
			props: {
				detail: detail({ isOpen: false, closedAt: '2026-10-21T08:00:00Z', status: 'rescinded' }),
				onChanged: () => {}
			}
		});

		expect(commands()).toHaveLength(0);
		expect(screen.getByText('Resolved')).toBeTruthy();
	});

	it('asks before rescinding access and withdraws the question on cancel', async () => {
		render(SetupEmailDetail, { props: { detail: detail(), onChanged: () => {} } });

		await fireEvent.click(screen.getByRole('button', { name: 'Rescind access' }));
		const dialog = await screen.findByRole('alertdialog');
		expect(dialog).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});

	it('refreshes the queue after a command settles, even when it failed', async () => {
		const onChanged = vi.fn();
		render(SetupEmailDetail, { props: { detail: detail(), onChanged } });

		const resend = forms.submits[1];
		const settle = (await resend({ cancel: () => {} } as never)) as (opts: unknown) => Promise<void>;
		await act(() =>
			settle({ result: { type: 'failure', status: 409, data: { error: 'This setup link was already replaced.' } } })
		);

		expect(onChanged).toHaveBeenCalledOnce();
		expect(screen.getByText('This setup link was already replaced.')).toBeTruthy();
	});

	it('says the inviter was told and keeps the item open', async () => {
		render(SetupEmailDetail, { props: { detail: detail(), onChanged: () => {} } });

		const settle = (await forms.submits[0]({ cancel: () => {} } as never)) as (opts: unknown) => Promise<void>;
		await act(() =>
			settle({ result: { type: 'success', status: 200, data: { success: true, action: 'askInviter' } } })
		);

		expect(screen.getByText(/inviter was notified/)).toBeTruthy();
		expect(askButton()).toBeTruthy();
	});
});
