// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { goto, invalidateAll } from '$app/navigation';
import Page from './+page.svelte';
import type { PageData } from './$types';
import { drainCodeFieldTimers } from '$lib/test-support/codeFieldTimers';

drainCodeFieldTimers();

vi.mock('$app/forms', () => ({ enhance: () => {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined), invalidateAll: vi.fn() }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it('allows a 72-character account password but blocks a matching 73-character password before submission', async () => {
	render(Page, {
		props: {
			data: { hasMFA: false, currentEmail: 'synthetic@example.test', pendingEmail: null } as PageData,
			form: null
		}
	});
	const passwordCard = within(screen.getByRole('heading', { name: 'Password' }).closest('[data-slot="card"]')!);
	await fireEvent.input(passwordCard.getByLabelText('Current password'), { target: { value: 'OldPassword12' } });
	const password = passwordCard.getByLabelText('New password');
	expect(password).toHaveAccessibleDescription(/72 characters or fewer/);
	const confirm = passwordCard.getByLabelText('Confirm new password');
	const submit = passwordCard.getByRole('button', { name: 'Update Password' });
	const accepted = `Aa1${'x'.repeat(69)}`;
	await fireEvent.input(password, { target: { value: accepted } });
	await fireEvent.input(confirm, { target: { value: accepted } });
	expect(submit).toBeEnabled();
	const tooLong = `${accepted}x`;
	await fireEvent.input(password, { target: { value: tooLong } });
	await fireEvent.input(confirm, { target: { value: tooLong } });
	expect(submit).toBeDisabled();
	const lengthStatus = screen.getByText('72 characters or fewer').closest('li');
	expect(lengthStatus).toHaveTextContent('Needed: 72 characters or fewer');
	expect(lengthStatus).toHaveAttribute('aria-live', 'polite');
});

describe('MFA admission redirects from an open security page', () => {
	it('follows suspension instead of accepting the disable response', async () => {
		const response = new Response('<html>Account suspended</html>');
		Object.defineProperties(response, { redirected: { value: true }, url: { value: 'http://localhost/suspended' } });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
		render(Page, {
			props: {
				data: { hasMFA: true, currentEmail: 'synthetic@example.test', pendingEmail: null } as PageData,
				form: null
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Disable MFA' }));
		await fireEvent.input(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm and Disable' }));
		await waitFor(() => expect(goto).toHaveBeenCalledWith('http://localhost/suspended'));
		expect(screen.queryByText(/MFA has been/)).toBeNull();
	});
});

it('sends Enable MFA to the full setup page', () => {
	render(Page, {
		props: {
			data: { hasMFA: false, currentEmail: 'synthetic@example.test', pendingEmail: null } as PageData,
			form: null
		}
	});
	expect(screen.getByRole('link', { name: 'Enable MFA' })).toHaveAttribute('href', '/auth/mfa-setup');
});

describe('fresh-challenge MFA disable', () => {
	it.each(['invalid code', 'provider unavailable', 'network failure', 'invalid success response'])(
		'keeps MFA enabled and code available after %s, then permits a serialized retry',
		async (failure) => {
			let finishDisable!: (response: Response) => void;
			const fetchMock = vi.fn();
			if (failure === 'network failure') fetchMock.mockRejectedValueOnce(new Error('Connection lost'));
			else if (failure === 'invalid success response') fetchMock.mockResolvedValueOnce(Response.json({}));
			else if (failure === 'invalid code')
				fetchMock.mockResolvedValueOnce(
					Response.json({ error: 'Invalid authenticator code. Try again.' }, { status: 401 })
				);
			else fetchMock.mockResolvedValueOnce(Response.json({ error: failure }, { status: 503 }));
			fetchMock.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						finishDisable = resolve;
					})
			);
			vi.stubGlobal('fetch', fetchMock);
			render(Page, {
				props: {
					data: { hasMFA: true, currentEmail: 'synthetic@example.test', pendingEmail: null } as PageData,
					form: null
				}
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Disable MFA' }));
			const code = screen.getByLabelText('Authenticator code');
			await fireEvent.input(code, { target: { value: '123456' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Confirm and Disable' }));
			if (failure === 'invalid code') {
				await waitFor(() => expect(code).toBeInvalid());
				expect(code).toHaveAccessibleDescription('Invalid authenticator code. Try again.');
				expect(screen.queryByText('Security issue')).toBeNull();
			} else {
				await screen.findByText('Security issue');
				expect(code).toBeValid();
			}
			expect(screen.getByText('Enabled')).toBeTruthy();
			expect(code).toHaveValue('123456');
			await fireEvent.input(code, { target: { value: '654321' } });
			await fireEvent.submit(code.closest('form')!);
			expect(screen.getByRole('button', { name: 'Keep MFA Enabled' })).toBeDisabled();
			expect(screen.getByRole('button', { name: /Confirm and Disable/ })).toBeDisabled();
			expect(code).toBeDisabled();
			await fireEvent.submit(code.closest('form')!);
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ code: '654321' });
			finishDisable(Response.json({ ok: true }));
			await screen.findByText('Disabled');
			expect(screen.queryByLabelText('Authenticator code')).toBeNull();
			expect(screen.getByRole('link', { name: 'Enable MFA' })).toHaveAttribute('href', '/auth/mfa-setup');
		}
	);
});

it('replaces acknowledged MFA state with an unavailable reload, then retries without losing email input', async () => {
	const data = { hasMFA: true, currentEmail: 'current@example.test', pendingEmail: null } as PageData;
	const view = render(Page, { props: { data, form: null } });
	const email = screen.getByLabelText('New email address');
	await fireEvent.input(email, { target: { value: 'draft@example.test' } });
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })));
	await fireEvent.click(screen.getByRole('button', { name: 'Disable MFA' }));
	await fireEvent.input(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Confirm and Disable' }));
	expect(await screen.findByRole('link', { name: 'Enable MFA' })).toHaveAttribute('href', '/auth/mfa-setup');
	await view.rerender({ data: { ...data, hasMFA: null }, form: null });
	expect(screen.queryByRole('link', { name: 'Enable MFA' })).toBeNull();
	expect(screen.queryByRole('button', { name: 'Disable MFA' })).toBeNull();
	expect(screen.queryByText('Disabled')).toBeNull();
	vi.mocked(invalidateAll).mockRejectedValueOnce(new Error('private transport detail'));
	await fireEvent.click(screen.getByRole('button', { name: 'Retry MFA status' }));
	await waitFor(() => expect(screen.getByRole('button', { name: 'Retry MFA status' })).toBeEnabled());
	expect(screen.queryByText(/private transport detail/)).toBeNull();
	expect(email).toHaveValue('draft@example.test');
	let finish!: () => void;
	vi.mocked(invalidateAll).mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			})
	);
	await fireEvent.click(screen.getByRole('button', { name: 'Retry MFA status' }));
	expect(screen.getByRole('button', { name: 'Checking MFA status' })).toBeDisabled();
	await view.rerender({ data: { ...data, hasMFA: true }, form: null });
	finish();
	expect(await screen.findByRole('button', { name: 'Disable MFA' })).toBeEnabled();
	expect(email).toHaveValue('draft@example.test');
});

describe('field-specific errors', () => {
	const noMfa = { hasMFA: false, currentEmail: 'synthetic@example.test', pendingEmail: null } as PageData;
	async function fillPasswordForm() {
		const card = within(screen.getByRole('heading', { name: 'Password' }).closest('[data-slot="card"]')!);
		const current = card.getByLabelText('Current password');
		const next = card.getByLabelText('New password');
		const confirm = card.getByLabelText('Confirm new password');
		await fireEvent.input(current, { target: { value: 'OldPassword12' } });
		await fireEvent.input(next, { target: { value: 'NewPassword12' } });
		await fireEvent.input(confirm, { target: { value: 'NewPassword12' } });
		return { current, next, confirm, submit: card.getByRole('button', { name: 'Update Password' }) };
	}

	it('ties a wrong current password to its field, keeps the drafts and returns focus to the first field', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ error: 'Current password is incorrect' }, { status: 401 }))
		);
		render(Page, { props: { data: noMfa, form: null } });
		const h = await fillPasswordForm();
		await fireEvent.click(h.submit);

		await waitFor(() => expect(h.current).toBeInvalid());
		expect(h.current).toHaveAccessibleDescription('Current password is incorrect');
		expect(screen.queryByText('Password update not confirmed')).toBeNull();
		expect(h.next).toBeValid();
		expect(h.current).toHaveValue('OldPassword12');
		expect(h.next).toHaveValue('NewPassword12');
		expect(h.confirm).toHaveValue('NewPassword12');
		await waitFor(() => expect(h.current).toHaveFocus());
		expect(h.submit).toBeEnabled();
	});

	it('keeps a rate limit as a form alert and clears the field error on the next attempt', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ error: 'Current password is incorrect' }, { status: 401 }))
			.mockResolvedValueOnce(
				Response.json({ error: 'Too many password update attempts. Please wait before trying again.' }, { status: 429 })
			);
		vi.stubGlobal('fetch', fetchMock);
		render(Page, { props: { data: noMfa, form: null } });
		const h = await fillPasswordForm();
		await fireEvent.click(h.submit);
		await waitFor(() => expect(h.current).toBeInvalid());

		await fireEvent.click(h.submit);
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Too many password update attempts. Please wait before trying again.'
		);
		expect(screen.getByText('Password update not confirmed')).toBeTruthy();
		expect(h.current).toBeValid();
		expect(h.current).not.toHaveAccessibleDescription('Current password is incorrect');
		expect(h.current).toHaveValue('OldPassword12');
		await waitFor(() => expect(h.current).toHaveFocus());
	});

	it('marks the confirmation field invalid while the new passwords differ', async () => {
		render(Page, { props: { data: noMfa, form: null } });
		const h = await fillPasswordForm();
		await fireEvent.input(h.confirm, { target: { value: 'NewPassword13' } });

		expect(h.confirm).toBeInvalid();
		expect(h.confirm).toHaveAccessibleDescription('Passwords do not match');
		expect(h.submit).toBeDisabled();

		await fireEvent.input(h.confirm, { target: { value: 'NewPassword12' } });

		expect(h.confirm).toBeValid();
		expect(h.submit).toBeEnabled();
	});

	it('ties a short disable code to Authenticator code without calling the server', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		render(Page, { props: { data: { ...noMfa, hasMFA: true } as PageData, form: null } });
		await fireEvent.click(screen.getByRole('button', { name: 'Disable MFA' }));
		const code = screen.getByLabelText('Authenticator code');
		await fireEvent.input(code, { target: { value: '12345' } });
		await fireEvent.submit(code.closest('form')!);

		expect(code).toBeInvalid();
		expect(code).toHaveAccessibleDescription('Please enter the 6-digit code from your authenticator app.');
		expect(code).toHaveValue('12345');
		expect(screen.queryByText('Security issue')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Keep MFA Enabled' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Disable MFA' }));
		expect(screen.getByLabelText('Authenticator code')).toBeValid();
	});
});
