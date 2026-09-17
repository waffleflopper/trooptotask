// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
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

describe('pending enrollment cancellation', () => {
	it.each(['provider rejection', 'network failure'])(
		'retains enrollment through %s and clears it only after retry succeeds',
		async (failure) => {
			let finishCancel!: (response: Response) => void;
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(Response.json({ factorId: 'pending-factor', qrCode: 'data:image/svg+xml,synthetic' }));
			if (failure === 'network failure') fetchMock.mockRejectedValueOnce(new Error('Connection lost'));
			else fetchMock.mockResolvedValueOnce(Response.json({ error: 'Cancellation unavailable' }, { status: 503 }));
			fetchMock.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						finishCancel = resolve;
					})
			);
			vi.stubGlobal('fetch', fetchMock);
			render(Page, {
				props: {
					data: { hasMFA: false, currentEmail: 'synthetic@example.test', pendingEmail: null } as PageData,
					form: null
				}
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Enable MFA' }));
			const code = await screen.findByLabelText('Verification code');
			await fireEvent.input(code, { target: { value: '123456' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			expect(
				await screen.findByText(failure === 'network failure' ? 'Connection lost' : 'Cancellation unavailable')
			).toBeTruthy();
			expect(screen.getByLabelText('Verification code')).toHaveValue('123456');
			expect(screen.getByRole('img', { name: 'MFA QR Code' })).toHaveAttribute('src', 'data:image/svg+xml,synthetic');
			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
			expect(screen.getByRole('button', { name: /Verify and Enable/ })).toBeDisabled();
			expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ factorId: 'pending-factor' });
			finishCancel(Response.json({ ok: true }));
			await waitFor(() => expect(screen.queryByLabelText('Verification code')).toBeNull());
			expect(screen.queryByRole('img', { name: 'MFA QR Code' })).toBeNull();
			expect(screen.getByRole('button', { name: 'Enable MFA' })).toBeEnabled();
		}
	);
});

describe('enrollment confirmation', () => {
	it.each(['invalid code', 'provider unavailable', 'network failure', 'invalid success response'])(
		'retains the same enrollment after %s and confirms only on explicit success',
		async (failure) => {
			let finishVerify!: (response: Response) => void;
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(Response.json({ factorId: 'pending-factor', qrCode: 'data:image/svg+xml,synthetic' }));
			if (failure === 'network failure') fetchMock.mockRejectedValueOnce(new Error('Connection lost'));
			else if (failure === 'invalid success response') fetchMock.mockResolvedValueOnce(Response.json({}));
			else
				fetchMock.mockResolvedValueOnce(
					Response.json({ error: failure }, { status: failure === 'invalid code' ? 401 : 503 })
				);
			fetchMock.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						finishVerify = resolve;
					})
			);
			vi.stubGlobal('fetch', fetchMock);
			render(Page, {
				props: {
					data: { hasMFA: false, currentEmail: 'synthetic@example.test', pendingEmail: null } as PageData,
					form: null
				}
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Enable MFA' }));
			const code = await screen.findByLabelText('Verification code');
			await fireEvent.input(code, { target: { value: '123456' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Verify and Enable' }));
			await screen.findByText('Security issue');
			expect(screen.getByText('Disabled')).toBeTruthy();
			expect(code).toHaveValue('123456');
			expect(screen.getByRole('img', { name: 'MFA QR Code' })).toHaveAttribute('src', 'data:image/svg+xml,synthetic');
			await fireEvent.click(screen.getByRole('button', { name: 'Verify and Enable' }));
			expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
			expect(screen.getByRole('button', { name: /Verify and Enable/ })).toBeDisabled();
			expect(code).toBeDisabled();
			await fireEvent.submit(code.closest('form')!);
			expect(fetchMock).toHaveBeenCalledTimes(3);
			expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ factorId: 'pending-factor', code: '123456' });
			finishVerify(Response.json({ ok: true }));
			await screen.findByText('Enabled');
			expect(screen.queryByLabelText('Verification code')).toBeNull();
			expect(screen.queryByRole('img', { name: 'MFA QR Code' })).toBeNull();
			expect(screen.getByRole('button', { name: 'Disable MFA' })).toBeEnabled();
		}
	);

	it('offers enrollment retry after creation fails', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ error: 'Enrollment unavailable' }, { status: 503 }))
			.mockResolvedValueOnce(Response.json({ factorId: 'pending-factor', qrCode: 'data:image/svg+xml,synthetic' }));
		vi.stubGlobal('fetch', fetchMock);
		render(Page, {
			props: {
				data: { hasMFA: false, currentEmail: 'synthetic@example.test', pendingEmail: null } as PageData,
				form: null
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Enable MFA' }));
		await screen.findByText('Enrollment unavailable');
		expect(screen.queryByLabelText('Verification code')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Enable MFA' }));
		expect(await screen.findByLabelText('Verification code')).toBeEnabled();
	});
});
