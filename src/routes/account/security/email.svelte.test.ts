// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import Page from './+page.svelte';
import type { PageData } from './$types';

const transport = vi.hoisted(() => ({ send: vi.fn(), update: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
// Exercise the component's actual enhancement callbacks; only framework transport is replaced.
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit: SubmitFunction) => {
		const listener = async (event: Event) => {
			event.preventDefault();
			let cancelled = false;
			const callback = await submit({
				formElement: node,
				formData: new FormData(),
				action: new URL('https://app.invalid/account/security?/updateEmail'),
				controller: new AbortController(),
				cancel: () => {
					cancelled = true;
				},
				submitter: null
			});
			if (cancelled) return;
			const result = await transport.send();
			if (callback)
				await callback({
					result,
					update: transport.update,
					formElement: node,
					formData: new FormData(),
					action: new URL('https://app.invalid/account/security?/updateEmail')
				});
		};
		node.addEventListener('submit', listener);
		return { destroy: () => node.removeEventListener('submit', listener) };
	}
}));
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
	vi.unstubAllGlobals();
});
async function fixture() {
	render(Page, {
		props: { data: { currentEmail: 'old@example.test', pendingEmail: null, hasMFA: true } as PageData, form: null }
	});
	const email = screen.getByLabelText('New email address');
	const password = document.getElementById('email-current-password')!;
	await fireEvent.input(email, { target: { value: 'new@example.test' } });
	await fireEvent.input(password, { target: { value: ' OldPassword12 ' } });
	return { email, password, form: email.closest('form')! };
}
it.each(['failure', 'error', 'invalid-success'])(
	'retains fields and focused retry after %s, and serializes confirmation',
	async (kind) => {
		const result =
			kind === 'failure'
				? { type: 'failure', status: 401, data: { emailError: 'Current password is incorrect' } }
				: kind === 'error'
					? { type: 'error', status: 500, error: new Error('private transport detail') }
					: { type: 'success', status: 200, data: {} };
		transport.send.mockResolvedValueOnce(result);
		const h = await fixture();
		await fireEvent.submit(h.form);
		await screen.findByText('Email request not confirmed');
		expect(h.email).toHaveValue('new@example.test');
		expect(h.password).toHaveValue(' OldPassword12 ');
		await waitFor(() => expect(h.password).toHaveFocus());
		expect(screen.queryByText('Confirmation sent')).toBeNull();
		expect(transport.update).not.toHaveBeenCalled();
		let finish!: (result: ActionResult) => void;
		transport.send.mockImplementationOnce(
			() =>
				new Promise<ActionResult>((resolve) => {
					finish = resolve;
				})
		);
		await fireEvent.submit(h.form);
		await fireEvent.submit(h.form);
		expect(transport.send).toHaveBeenCalledTimes(2);
		expect(h.email).toBeDisabled();
		expect(h.password).toBeDisabled();
		expect(screen.getByRole('button', { name: /Send Confirmation/ })).toBeDisabled();
		finish({
			type: 'success',
			status: 200,
			data: { emailSuccess: 'Follow both inbox confirmations.', pendingEmail: 'new@example.test' }
		});
		await screen.findByText('Confirmation sent');
		expect(h.password).toHaveValue('');
		expect(screen.getByText('old@example.test')).toBeTruthy();
		expect(screen.getByText('new@example.test')).toBeTruthy();
		expect(transport.update).toHaveBeenCalledWith({ reset: false });
	}
);
it('shows a global throttle as an email action error without losing the draft', async () => {
	transport.send.mockResolvedValueOnce({
		type: 'failure',
		status: 429,
		data: { error: 'Too many requests. Please wait and try again.' }
	});
	const h = await fixture();
	await fireEvent.submit(h.form);
	await screen.findByText('Too many requests. Please wait and try again.');
	expect(h.email).toHaveValue('new@example.test');
	expect(h.password).toHaveValue(' OldPassword12 ');
	await waitFor(() => expect(h.password).toHaveFocus());
	expect(screen.queryByText('Confirmation sent')).toBeNull();
	expect(transport.update).not.toHaveBeenCalled();
});
it('restores provider pending confirmation on reload without claiming the address is already current', () => {
	render(Page, {
		props: {
			data: { currentEmail: 'old@example.test', pendingEmail: 'new@example.test', hasMFA: true } as PageData,
			form: null
		}
	});
	expect(screen.getByText('old@example.test')).toBeTruthy();
	expect(screen.getByText('new@example.test')).toBeTruthy();
	expect(screen.queryByText('Confirmation sent')).toBeNull();
});
it('retains the email draft through inline MFA and requires explicit retry', async () => {
	transport.send.mockResolvedValueOnce({
		type: 'failure',
		status: 403,
		data: { emailError: 'Verify authenticator', code: 'mfa_required' }
	});
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })));
	const h = await fixture();
	await fireEvent.submit(h.form);
	const code = await screen.findByLabelText('Authenticator Code');
	expect(h.password).toBeDisabled();
	await fireEvent.input(code, { target: { value: '123456' } });
	await fireEvent.submit(code.closest('form')!);
	await waitFor(() => expect(h.password).toHaveFocus());
	expect(h.email).toHaveValue('new@example.test');
	expect(h.password).toHaveValue(' OldPassword12 ');
	expect(transport.send).toHaveBeenCalledTimes(1);
	expect(screen.getByRole('button', { name: /Send Confirmation/ })).toBeEnabled();
});
