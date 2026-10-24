// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { goto, invalidateAll } from '$app/navigation';
import SecurityPage from './SecurityPage.svelte';
import type { AccountSecurityOverview } from './contracts';

vi.mock('$app/forms', () => ({ enhance: () => {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined), invalidateAll: vi.fn() }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

const SETUP_HREF = '/auth/mfa-setup?next=%2Forg%2Falpha%2Faccount%2Fsecurity';

function renderPage(hasMFA: boolean | null) {
	const security: AccountSecurityOverview = { hasMFA, currentEmail: 'synthetic@example.test', pendingEmail: null };
	return render(SecurityPage, {
		props: { security, passwordCompletion: null, form: null, mfaSetupHref: SETUP_HREF }
	});
}

async function openPasswordRow() {
	await fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
	return {
		current: screen.getByLabelText('Current password'),
		next: screen.getByLabelText('New password'),
		confirm: screen.getByLabelText('Confirm new'),
		submit: screen.getByRole('button', { name: 'Update password' })
	};
}

async function fillPasswordRow() {
	const row = await openPasswordRow();
	await fireEvent.input(row.current, { target: { value: 'OldPassword12' } });
	await fireEvent.input(row.next, { target: { value: 'NewPassword12' } });
	await fireEvent.input(row.confirm, { target: { value: 'NewPassword12' } });
	return row;
}

async function openTurnOff() {
	await fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
	return {
		code: screen.getByLabelText('Authenticator code'),
		confirm: screen.getByRole('button', { name: 'Turn off two-factor' }),
		keep: screen.getByRole('button', { name: 'Keep it on' })
	};
}

describe('password row', () => {
	it('keeps Update password disabled until every checklist rule passes, up to 72 characters', async () => {
		renderPage(false);
		const row = await openPasswordRow();
		expect(row.next).toHaveAccessibleDescription(/12\+ characters.*Upper and lower.*A number.*Both match/);
		await fireEvent.input(row.current, { target: { value: 'OldPassword12' } });
		await fireEvent.input(row.next, { target: { value: 'NewPasswrd1' } });
		await fireEvent.input(row.confirm, { target: { value: 'NewPasswrd1' } });
		expect(row.submit).toBeDisabled();
		const accepted = `Aa1${'x'.repeat(69)}`;
		await fireEvent.input(row.next, { target: { value: accepted } });
		await fireEvent.input(row.confirm, { target: { value: accepted } });
		expect(row.submit).toBeEnabled();
		await fireEvent.input(row.next, { target: { value: `${accepted}x` } });
		await fireEvent.input(row.confirm, { target: { value: `${accepted}x` } });
		expect(row.submit).toBeDisabled();
		const lengthStatus = screen.getByText('72 characters or fewer').closest('li');
		expect(lengthStatus).toHaveTextContent('Needed: 72 characters or fewer');
		expect(lengthStatus).toHaveAttribute('aria-live', 'polite');
	});

	it('restores the row exactly on Cancel, so reopening starts empty', async () => {
		renderPage(false);
		const row = await fillPasswordRow();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByLabelText('Current password')).toBeNull();
		await waitFor(() => expect(screen.getByRole('button', { name: 'Change password' })).toHaveFocus());
		const reopened = await openPasswordRow();
		expect(reopened.current).toHaveValue('');
		expect(reopened.next).toHaveValue('');
		expect(row.current).not.toBeInTheDocument();
	});

	it('ties a wrong current password to its field, keeps the drafts and returns focus to the first field', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ error: 'Current password is incorrect' }, { status: 401 }))
		);
		renderPage(false);
		const h = await fillPasswordRow();
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
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(Response.json({ error: 'Current password is incorrect' }, { status: 401 }))
				.mockResolvedValueOnce(
					Response.json(
						{ error: 'Too many password update attempts. Please wait before trying again.' },
						{ status: 429 }
					)
				)
		);
		renderPage(false);
		const h = await fillPasswordRow();
		await fireEvent.click(h.submit);
		await waitFor(() => expect(h.current).toBeInvalid());

		await fireEvent.click(h.submit);
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Too many password update attempts. Please wait before trying again.'
		);
		expect(screen.getByText('Password update not confirmed')).toBeTruthy();
		expect(h.current).toBeValid();
		expect(h.current).toHaveValue('OldPassword12');
		await waitFor(() => expect(h.current).toHaveFocus());
	});

	it('marks the confirmation field invalid while the new passwords differ', async () => {
		renderPage(false);
		const h = await fillPasswordRow();
		await fireEvent.input(h.confirm, { target: { value: 'NewPassword13' } });

		expect(h.confirm).toBeInvalid();
		expect(h.confirm).toHaveAccessibleDescription('Passwords do not match');
		expect(h.submit).toBeDisabled();

		await fireEvent.input(h.confirm, { target: { value: 'NewPassword12' } });
		expect(h.confirm).toBeValid();
		expect(h.submit).toBeEnabled();
	});
});

describe('two-factor row', () => {
	it('links Turn on to full-page setup that returns here', () => {
		renderPage(false);
		expect(screen.getByRole('link', { name: 'Turn on' })).toHaveAttribute('href', SETUP_HREF);
		expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
	});

	it('opens one row at a time, discarding the other row’s draft', async () => {
		renderPage(true);
		await fillPasswordRow();
		await openTurnOff();
		expect(screen.queryByLabelText('Current password')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
		expect(screen.queryByLabelText('Authenticator code')).toBeNull();
		expect(screen.getByLabelText('Current password')).toHaveValue('');
	});

	it('keeps Turn off two-factor disabled until six digits are in, with Keep it on first', async () => {
		vi.stubGlobal('fetch', vi.fn());
		renderPage(true);
		const panel = await openTurnOff();
		await waitFor(() => expect(panel.code).toHaveFocus());
		expect(panel.keep.compareDocumentPosition(panel.confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(panel.confirm).toBeDisabled();
		await fireEvent.input(panel.code, { target: { value: '12345' } });
		expect(panel.confirm).toBeDisabled();
		await fireEvent.input(panel.code, { target: { value: '123456' } });
		expect(panel.confirm).toBeEnabled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('ties a short code to its field without calling the server', async () => {
		vi.stubGlobal('fetch', vi.fn());
		renderPage(true);
		const { code } = await openTurnOff();
		await fireEvent.input(code, { target: { value: '12345' } });
		await fireEvent.submit(code.closest('form')!);

		expect(code).toBeInvalid();
		expect(code).toHaveAccessibleDescription('Please enter the 6-digit code from your authenticator app.');
		expect(fetch).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Keep it on' }));
		await openTurnOff();
		expect(screen.getByLabelText('Authenticator code')).toBeValid();
	});

	it.each(['invalid code', 'provider unavailable', 'network failure', 'invalid success response'])(
		'keeps two-factor on and the code available after %s, then permits a serialized retry',
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
			renderPage(true);
			const { code, confirm, keep } = await openTurnOff();
			await fireEvent.input(code, { target: { value: '123456' } });
			await fireEvent.click(confirm);
			if (failure === 'invalid code') {
				await waitFor(() => expect(code).toBeInvalid());
				expect(code).toHaveAccessibleDescription('Invalid authenticator code. Try again.');
				expect(screen.queryByText('Security issue')).toBeNull();
			} else {
				await screen.findByText('Security issue');
				expect(code).toBeValid();
			}
			expect(screen.getByText('On')).toBeTruthy();
			expect(code).toHaveValue('123456');
			await fireEvent.input(code, { target: { value: '654321' } });
			await fireEvent.submit(code.closest('form')!);
			expect(keep).toBeDisabled();
			expect(confirm).toBeDisabled();
			await fireEvent.submit(code.closest('form')!);
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ code: '654321' });
			finishDisable(Response.json({ ok: true }));
			await screen.findByText('Off');
			expect(screen.queryByLabelText('Authenticator code')).toBeNull();
			expect(screen.getByRole('link', { name: 'Turn on' })).toHaveAttribute('href', SETUP_HREF);
		}
	);

	it('follows an admission redirect instead of accepting the disable response', async () => {
		const response = new Response('<html>Account suspended</html>');
		Object.defineProperties(response, { redirected: { value: true }, url: { value: 'http://localhost/suspended' } });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
		renderPage(true);
		const { code, confirm } = await openTurnOff();
		await fireEvent.input(code, { target: { value: '123456' } });
		await fireEvent.click(confirm);
		await waitFor(() => expect(goto).toHaveBeenCalledWith('http://localhost/suspended'));
		expect(screen.queryByText('Two-factor is off.')).toBeNull();
	});

	it('replaces an acknowledged state with an unavailable reload, then retries quietly', async () => {
		const security = { hasMFA: true, currentEmail: 'current@example.test', pendingEmail: null };
		const view = render(SecurityPage, {
			props: { security, passwordCompletion: null, form: null, mfaSetupHref: SETUP_HREF }
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })));
		const { code, confirm } = await openTurnOff();
		await fireEvent.input(code, { target: { value: '123456' } });
		await fireEvent.click(confirm);
		expect(await screen.findByRole('link', { name: 'Turn on' })).toBeTruthy();
		await view.rerender({ security: { ...security, hasMFA: null } });
		expect(screen.queryByRole('link', { name: 'Turn on' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
		vi.mocked(invalidateAll).mockRejectedValueOnce(new Error('private transport detail'));
		await fireEvent.click(screen.getByRole('button', { name: 'Retry MFA status' }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Retry MFA status' })).toBeEnabled());
		expect(screen.queryByText(/private transport detail/)).toBeNull();
		let finish!: () => void;
		vi.mocked(invalidateAll).mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Retry MFA status' }));
		expect(screen.getByRole('button', { name: 'Checking MFA status' })).toBeDisabled();
		await view.rerender({ security: { ...security, hasMFA: true } });
		finish();
		expect(await screen.findByRole('button', { name: 'Turn off' })).toBeEnabled();
	});
});
