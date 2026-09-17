// @vitest-environment happy-dom
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
		expect(screen.queryByLabelText('New Password')).toBeNull();
	}
);
