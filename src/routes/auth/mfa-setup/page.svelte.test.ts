// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import { MFA_CODE_REJECTED_MESSAGE } from '$features/identity/contracts';
import { drainCodeFieldTimers } from '$lib/test-support/codeFieldTimers';
import Page from './+page.svelte';

drainCodeFieldTimers();

vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

const next = '/org/alpha/settings';
const ready = () =>
	Response.json({ factorId: 'factor-1', qrCode: 'data:image/png;base64,AAAA', secret: 'ABCDEFGHJKLM' });
const renderPage = () => render(Page, { props: { data: { next } } as never });
const codeField = () => screen.getByLabelText('6-digit code from the app');

it('holds the code field until the authenticator secret arrives, then shows the QR code and key', async () => {
	let finishEnroll: (response: Response) => void = () => {};
	vi.stubGlobal(
		'fetch',
		vi.fn(() => new Promise<Response>((resolve) => (finishEnroll = resolve)))
	);
	renderPage();
	expect(screen.queryByRole('img', { name: 'QR code for your authenticator app' })).toBeNull();
	expect(codeField()).toBeDisabled();
	finishEnroll(ready());
	expect(await screen.findByRole('img', { name: 'QR code for your authenticator app' })).toHaveAttribute(
		'src',
		'data:image/png;base64,AAAA'
	);
	expect(screen.getByText('ABCD EFGH JKLM')).toBeVisible();
	expect(codeField()).toBeEnabled();
});

it('copies the ungrouped setup key', async () => {
	const writeText = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ready()));
	renderPage();
	await fireEvent.click(await screen.findByRole('button', { name: 'Copy key' }));
	expect(writeText).toHaveBeenCalledWith('ABCDEFGHJKLM');
	expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
});

it('turns MFA on from the sixth digit and returns to the continuation with fresh data', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(ready())
		.mockResolvedValueOnce(Response.json({ ok: true }));
	vi.stubGlobal('fetch', fetchMock);
	renderPage();
	await waitFor(() => expect(codeField()).toBeEnabled());
	await fireEvent.input(codeField(), { target: { value: '123456' } });
	await waitFor(() => expect(goto).toHaveBeenCalledWith(next, { invalidateAll: true }));
	expect(fetchMock).toHaveBeenLastCalledWith(
		'/api/auth/mfa/enroll/verify',
		expect.objectContaining({ body: JSON.stringify({ factorId: 'factor-1', code: '123456' }) })
	);
});

it('ties a rejected code to the field and lets a new code retry', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(ready())
		.mockResolvedValueOnce(Response.json({ error: MFA_CODE_REJECTED_MESSAGE }, { status: 401 }))
		.mockResolvedValueOnce(Response.json({ ok: true }));
	vi.stubGlobal('fetch', fetchMock);
	renderPage();
	await waitFor(() => expect(codeField()).toBeEnabled());
	await fireEvent.input(codeField(), { target: { value: '123456' } });
	await waitFor(() => expect(codeField()).toHaveAccessibleDescription(MFA_CODE_REJECTED_MESSAGE));
	expect(codeField()).toBeInvalid();
	expect(codeField()).toHaveValue('123456');
	expect(goto).not.toHaveBeenCalled();
	await fireEvent.input(codeField(), { target: { value: '654321' } });
	await waitFor(() => expect(goto).toHaveBeenCalledWith(next, { invalidateAll: true }));
});

it('shows an expired session as a form alert rather than a wrong code', async () => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValueOnce(ready())
			.mockResolvedValueOnce(Response.json({ error: 'Please sign in before managing MFA.' }, { status: 401 }))
	);
	renderPage();
	await waitFor(() => expect(codeField()).toBeEnabled());
	await fireEvent.input(codeField(), { target: { value: '123456' } });
	expect(await screen.findByRole('alert')).toHaveTextContent('Please sign in before managing MFA.');
	expect(codeField()).toBeValid();
});

it('says MFA is already on instead of offering a second factor', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'MFA is already on.' }, { status: 409 })));
	renderPage();
	expect(await screen.findByRole('heading', { level: 1, name: 'MFA is on' })).toBeVisible();
	expect(screen.queryByLabelText('6-digit code from the app')).toBeNull();
	await fireEvent.click(screen.getByRole('button', { name: 'Back to security' }));
	expect(goto).toHaveBeenCalledWith(next, { invalidateAll: true });
});

it('offers a retry when setup cannot start', async () => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValueOnce(Response.json({ error: 'MFA is unavailable right now.' }, { status: 503 }))
			.mockResolvedValueOnce(ready())
	);
	renderPage();
	expect(await screen.findByRole('alert')).toHaveTextContent('MFA is unavailable right now.');
	await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
	expect(await screen.findByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
});

it('follows an admission redirect instead of reading the setup response', async () => {
	const response = new Response('<html>Account suspended</html>');
	Object.defineProperties(response, { redirected: { value: true }, url: { value: 'http://localhost/suspended' } });
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
	renderPage();
	await waitFor(() => expect(goto).toHaveBeenCalledWith('http://localhost/suspended'));
	expect(screen.queryByRole('img', { name: 'QR code for your authenticator app' })).toBeNull();
});

it('discards the pending factor when setup is cancelled', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(ready())
		.mockResolvedValueOnce(Response.json({ ok: true }));
	vi.stubGlobal('fetch', fetchMock);
	renderPage();
	await screen.findByRole('img', { name: 'QR code for your authenticator app' });
	await fireEvent.click(screen.getByRole('button', { name: 'Cancel setup' }));
	await waitFor(() => expect(goto).toHaveBeenCalledWith(next, { invalidateAll: true }));
	expect(fetchMock).toHaveBeenLastCalledWith(
		'/api/auth/mfa/enroll/cancel',
		expect.objectContaining({ body: JSON.stringify({ factorId: 'factor-1' }) })
	);
});
