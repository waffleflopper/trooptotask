// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => {
	cleanup();
	window.history.replaceState({}, '', '/auth/mfa-verify');
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it('retains a safe continuation after a failed verification and uses it after retry', async () => {
	window.history.replaceState(
		{},
		'',
		'/auth/mfa-verify?next=%2Forg%2Falpha%2Fcalendar%3Fview%3Dmonth%26label%3DA%2526B%23today'
	);
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValueOnce(Response.json({ error: 'Invalid code' }, { status: 401 }))
			.mockResolvedValueOnce(Response.json({ ok: true }))
	);
	render(Page);
	await fireEvent.input(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
	expect(await screen.findByRole('alert')).toBeTruthy();
	expect(goto).not.toHaveBeenCalled();
	await fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
	await waitFor(() => expect(goto).toHaveBeenCalledWith('/org/alpha/calendar?view=month&label=A%26B#today'));
});

it.each(['https://external.invalid/phish', '/a/..//external.invalid'])(
	'rejects a directly forged MFA continuation %s after successful verification',
	async (next) => {
		window.history.replaceState({}, '', `/auth/mfa-verify?next=${encodeURIComponent(next)}`);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })));
		render(Page);
		await fireEvent.input(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
		await waitFor(() => expect(goto).toHaveBeenCalledWith('/dashboard'));
	}
);

it('returns to login when the session expires before MFA verification', async () => {
	const response = new Response('<html>Sign in</html>');
	Object.defineProperties(response, { redirected: { value: true }, url: { value: 'http://localhost/auth/login' } });
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
	render(Page);
	await fireEvent.input(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
	await waitFor(() => expect(goto).toHaveBeenCalledWith('http://localhost/auth/login'));
	expect(goto).not.toHaveBeenCalledWith('/dashboard');
});

it.each(['invalid code', 'provider unavailable', 'network failure', 'invalid success response'])(
	'retains verification after %s and advances only after a serialized successful retry',
	async (failure) => {
		let finish!: (response: Response) => void;
		const fetchMock = vi.fn();
		if (failure === 'network failure') fetchMock.mockRejectedValueOnce(new Error('Connection lost'));
		else if (failure === 'invalid success response') fetchMock.mockResolvedValueOnce(Response.json({}));
		else
			fetchMock.mockResolvedValueOnce(
				Response.json({ error: failure }, { status: failure === 'invalid code' ? 401 : 503 })
			);
		fetchMock.mockImplementationOnce(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		render(Page);
		const code = await screen.findByLabelText('Verification Code');
		await fireEvent.input(code, { target: { value: '123456' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(goto).not.toHaveBeenCalled();
		expect(code).toHaveValue('123456');
		await fireEvent.input(code, { target: { value: '654321' } });
		await fireEvent.submit(code.closest('form')!);
		expect(code).toBeDisabled();
		expect(screen.getByRole('button', { name: /Verifying/ })).toBeDisabled();
		await fireEvent.submit(code.closest('form')!);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse(fetchMock.mock.calls[2 - 1][1].body)).toEqual({ code: '654321' });
		finish(Response.json({ ok: true }));
		await waitFor(() => expect(goto).toHaveBeenCalledWith('/dashboard'));
	}
);
