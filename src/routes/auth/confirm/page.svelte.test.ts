// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import Page from './+page.svelte';

const transport = vi.hoisted(() => ({ send: vi.fn(), update: vi.fn() }));
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit: SubmitFunction) => {
		const listener = async (event: Event) => {
			event.preventDefault();
			const callback = await submit({
				formElement: node,
				formData: new FormData(node),
				action: new URL('https://app.invalid/auth/confirm'),
				controller: new AbortController(),
				cancel: vi.fn(),
				submitter: null
			});
			if (callback)
				await callback({
					result: await transport.send(),
					update: transport.update,
					formElement: node,
					formData: new FormData(node),
					action: new URL('https://app.invalid/auth/confirm')
				});
		};
		node.addEventListener('submit', listener);
		return { destroy: () => node.removeEventListener('submit', listener) };
	}
}));
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});

it('shows a throttled confirmation attempt and keeps the explicit invite button available', async () => {
	transport.send.mockResolvedValueOnce({
		type: 'failure',
		status: 429,
		data: { error: 'Too many requests. Please wait and try again.' }
	});
	render(Page, {
		data: {
			session: null,
			confirmation: {
				status: 'valid',
				tokenHash: 'synthetic-invite-token',
				type: 'invite',
				next: '/auth/accept-invite'
			}
		}
	});
	const button = screen.getByRole('button', { name: 'Continue to Invite Setup' });
	await fireEvent.submit(button.closest('form')!);
	expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Please wait and try again.');
	expect(button).toBeEnabled();
	expect(transport.update).not.toHaveBeenCalled();
});
