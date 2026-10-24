// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import SecurityPage from './SecurityPage.svelte';
import { controlCodeFieldTimers } from '$lib/test-support/codeFieldTimers';

controlCodeFieldTimers();

const transport = vi.hoisted(() => ({ send: vi.fn(), update: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
// Exercise the component's actual enhancement callbacks; only framework transport is replaced.
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit: SubmitFunction) => {
		const listener = async (event: Event) => {
			event.preventDefault();
			let cancelled = false;
			const callback = await submit({
				formElement: node,
				formData: new FormData(),
				action: new URL('https://app.invalid/org/alpha/account/security?/updateEmail'),
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
					action: new URL('https://app.invalid/org/alpha/account/security?/updateEmail')
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
function renderPage(pendingEmail: string | null = null) {
	render(SecurityPage, {
		props: {
			security: { currentEmail: 'old@example.test', pendingEmail, hasMFA: true },
			passwordCompletion: null,
			form: null,
			mfaSetupHref: '/auth/mfa-setup'
		}
	});
}
async function fixture() {
	renderPage();
	await fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
	const email = screen.getByLabelText('New email');
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
		if (kind === 'failure') {
			await waitFor(() => expect(h.password).toBeInvalid());
			expect(h.password).toHaveAccessibleDescription('Current password is incorrect');
			expect(screen.queryByText('Email request not confirmed')).toBeNull();
			expect(h.email).toBeValid();
		} else {
			await screen.findByText('Email request not confirmed');
			expect(h.password).toBeValid();
		}
		expect(h.email).toHaveValue('new@example.test');
		expect(h.password).toHaveValue(' OldPassword12 ');
		await waitFor(() => expect(h.password).toHaveFocus());
		expect(screen.queryByText(/^Pending:/)).toBeNull();
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
		expect(screen.getByRole('button', { name: /Send confirmation/ })).toBeDisabled();
		finish({
			type: 'success',
			status: 200,
			data: { emailSuccess: 'Follow both inbox confirmations.', pendingEmail: 'new@example.test' }
		});
		expect(await screen.findByText('Follow both inbox confirmations.')).toBeTruthy();
		expect(h.password).not.toBeInTheDocument();
		expect(screen.getByText('old@example.test')).toBeTruthy();
		expect(screen.getByText(/Pending: new@example\.test\./)).toBeTruthy();
		await waitFor(() => expect(screen.getByRole('button', { name: 'Change email' })).toHaveFocus());
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
	expect(screen.getByText('Email request not confirmed')).toBeTruthy();
	expect(h.email).toBeValid();
	expect(h.password).toBeValid();
	expect(h.email).toHaveValue('new@example.test');
	expect(h.password).toHaveValue(' OldPassword12 ');
	await waitFor(() => expect(h.password).toHaveFocus());
	expect(screen.queryByText(/^Pending:/)).toBeNull();
	expect(transport.update).not.toHaveBeenCalled();
});
it('restores provider pending confirmation on reload without claiming the address is already current', () => {
	renderPage('new@example.test');
	expect(screen.getByText('old@example.test')).toBeTruthy();
	expect(screen.getByRole('status')).toHaveTextContent(
		'Pending: new@example.test. Follow the links sent to both inboxes to finish the switch.'
	);
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
	const code = await screen.findByLabelText(/^Authenticator code/i);
	expect(h.password).toBeDisabled();
	await fireEvent.input(code, { target: { value: '123456' } });
	await waitFor(() => expect(h.password).toHaveFocus());
	expect(h.email).toHaveValue('new@example.test');
	expect(h.password).toHaveValue(' OldPassword12 ');
	expect(transport.send).toHaveBeenCalledTimes(1);
	expect(screen.getByRole('button', { name: /Send confirmation/ })).toBeEnabled();
});
it.each([
	['Enter a valid email address', 'email'],
	['Enter a different email address', 'email'],
	['Enter your current password to change your email', 'password']
])('ties "%s" to the %s field, focuses it and keeps both drafts', async (emailError, field) => {
	transport.send.mockResolvedValueOnce({
		type: 'failure',
		status: 400,
		data: { emailError, email: 'new@example.test' }
	});
	const h = await fixture();
	await fireEvent.submit(h.form);
	const [invalid, valid] = field === 'email' ? [h.email, h.password] : [h.password, h.email];
	await waitFor(() => expect(invalid).toBeInvalid());
	expect(invalid).toHaveAccessibleDescription(emailError);
	expect(valid).toBeValid();
	expect(screen.queryByText('Email request not confirmed')).toBeNull();
	expect(h.email).toHaveValue('new@example.test');
	expect(h.password).toHaveValue(' OldPassword12 ');
	await waitFor(() => expect(invalid).toHaveFocus());
});
it('clears a field error when the next request is sent and keeps a provider outage as a form alert', async () => {
	transport.send
		.mockResolvedValueOnce({ type: 'failure', status: 401, data: { emailError: 'Current password is incorrect' } })
		.mockResolvedValueOnce({
			type: 'failure',
			status: 503,
			data: { emailError: 'Unable to verify your current password. Please try again.' }
		});
	const h = await fixture();
	await fireEvent.submit(h.form);
	await waitFor(() => expect(h.password).toBeInvalid());
	await fireEvent.submit(h.form);
	expect(await screen.findByText('Email request not confirmed')).toBeTruthy();
	expect(screen.getByRole('alert')).toHaveTextContent('Unable to verify your current password. Please try again.');
	expect(h.password).toBeValid();
	expect(h.email).toBeValid();
});
