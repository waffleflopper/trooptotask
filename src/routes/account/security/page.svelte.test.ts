// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import Page from './+page.svelte';
import type { PageData } from './$types';

vi.mock('$app/forms', () => ({ enhance: () => {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('MFA admission redirects from an open security page', () => {
	it.each(['enroll', 'verify', 'cancel', 'disable'])(
		'follows suspension instead of accepting the %s response',
		async (action) => {
			const response = new Response('<html>Account suspended</html>');
			Object.defineProperties(response, { redirected: { value: true }, url: { value: 'http://localhost/suspended' } });
			const fetchMock = vi.fn().mockResolvedValue(response);
			if (action === 'verify' || action === 'cancel') {
				fetchMock.mockResolvedValueOnce(
					Response.json({ factorId: 'pending-factor', qrCode: 'data:image/svg+xml,synthetic' })
				);
			}
			vi.stubGlobal('fetch', fetchMock);
			render(Page, {
				props: {
					data: {
						hasMFA: action === 'disable',
						currentEmail: 'synthetic@example.test',
						pendingEmail: null
					} as PageData,
					form: null
				}
			});
			await fireEvent.click(screen.getByRole('button', { name: action === 'disable' ? 'Disable MFA' : 'Enable MFA' }));
			if (action === 'verify') {
				await fireEvent.input(await screen.findByLabelText('Verification code'), { target: { value: '123456' } });
				await fireEvent.click(screen.getByRole('button', { name: 'Verify and Enable' }));
			} else if (action === 'cancel') {
				await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
			} else if (action === 'disable') {
				await fireEvent.input(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } });
				await fireEvent.click(screen.getByRole('button', { name: 'Confirm and Disable' }));
			}
			await waitFor(() => expect(goto).toHaveBeenCalledWith('http://localhost/suspended'));
			expect(screen.queryByText(/MFA has been/)).toBeNull();
		}
	);
});
