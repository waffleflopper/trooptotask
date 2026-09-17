// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { goto } from '$app/navigation';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined), replaceState: vi.fn() }));
vi.mock('$app/stores', () => ({ page: writable({ data: { hasSession: true }, state: {} }) }));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it.each(['status', 'verification'])(
	'returns to login when the recovery session expires during MFA %s',
	async (stage) => {
		const response = new Response('<html>Sign in</html>');
		Object.defineProperties(response, { redirected: { value: true }, url: { value: 'http://localhost/auth/login' } });
		const fetchMock = vi.fn().mockResolvedValue(response);
		if (stage === 'verification')
			fetchMock.mockResolvedValueOnce(Response.json({ currentLevel: 'aal1', nextLevel: 'aal2' }));
		vi.stubGlobal('fetch', fetchMock);
		render(Page);
		if (stage === 'verification') {
			await fireEvent.input(await screen.findByLabelText('Authenticator Code'), { target: { value: '123456' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Verify Code' }));
		}
		await waitFor(() => expect(goto).toHaveBeenCalledWith('http://localhost/auth/login'));
		expect(screen.queryByLabelText(/^New Password/)).toBeNull();
	}
);

it.each(['invalid code', 'provider unavailable', 'network failure', 'invalid success response'])(
	'retains verification after %s and advances only after a serialized successful retry',
	async (failure) => {
		let finish!: (response: Response) => void;
		const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ currentLevel: 'aal1', nextLevel: 'aal2' }));
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
		const code = await screen.findByLabelText('Authenticator Code');
		await fireEvent.input(code, { target: { value: '123456' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Verify Code' }));
		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(screen.queryByLabelText(/^New Password/)).toBeNull();
		expect(code).toHaveValue('123456');
		await fireEvent.input(code, { target: { value: '654321' } });
		await fireEvent.submit(code.closest('form')!);
		expect(code).toBeDisabled();
		expect(screen.getByRole('button', { name: /Verifying/ })).toBeDisabled();
		await fireEvent.submit(code.closest('form')!);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(JSON.parse(fetchMock.mock.calls[3 - 1][1].body)).toEqual({ code: '654321' });
		finish(Response.json({ ok: true }));
		expect(await screen.findByLabelText(/^New Password/)).toBeEnabled();
		expect(screen.queryByLabelText('Authenticator Code')).toBeNull();
	}
);
