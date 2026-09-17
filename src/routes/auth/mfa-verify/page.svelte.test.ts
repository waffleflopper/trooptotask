// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

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
