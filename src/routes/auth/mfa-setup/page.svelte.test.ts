// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import { MFA_CODE_REJECTED_MESSAGE } from '$features/identity/contracts';
import { controlCodeFieldTimers } from '$lib/test-support/codeFieldTimers';
import Page from './+page.svelte';

controlCodeFieldTimers();

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
	await waitFor(() => expect(codeField()).toHaveFocus());
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

it('tells the user to copy the key by hand when the browser refuses the clipboard', async () => {
	vi.stubGlobal('navigator', {
		...navigator,
		clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
	});
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ready()));
	renderPage();
	await fireEvent.click(await screen.findByRole('button', { name: 'Copy key' }));
	expect(await screen.findByRole('status')).toHaveTextContent("Couldn't copy. Select the key and copy it.");
	expect(screen.getByRole('button', { name: 'Copy key' })).toBeVisible();
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

it('holds Cancel while the sixth digit turns MFA on, so only the verification reaches the server', async () => {
	let finishVerify!: (response: Response) => void;
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(ready())
		.mockImplementationOnce(() => new Promise<Response>((resolve) => (finishVerify = resolve)));
	vi.stubGlobal('fetch', fetchMock);
	renderPage();
	await waitFor(() => expect(codeField()).toBeEnabled());
	await fireEvent.input(codeField(), { target: { value: '123456' } });
	const cancel = screen.getByRole('button', { name: 'Cancel setup' });
	await waitFor(() => expect(cancel).toBeDisabled());
	expect(codeField()).toBeDisabled();
	await fireEvent.click(cancel);
	finishVerify(Response.json({ ok: true }));
	await waitFor(() => expect(goto).toHaveBeenCalledWith(next, { invalidateAll: true }));
	expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/auth/mfa/enroll', '/api/auth/mfa/enroll/verify']);
});

it('holds the code field and Verify while a cancellation runs', async () => {
	let finishCancel!: (response: Response) => void;
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(ready())
		.mockImplementationOnce(() => new Promise<Response>((resolve) => (finishCancel = resolve)));
	vi.stubGlobal('fetch', fetchMock);
	renderPage();
	await waitFor(() => expect(codeField()).toBeEnabled());
	await fireEvent.click(screen.getByRole('button', { name: 'Cancel setup' }));
	expect(codeField()).toBeDisabled();
	expect(screen.getByRole('button', { name: 'Verify and turn on' })).toBeDisabled();
	await fireEvent.input(codeField(), { target: { value: '123456' } });
	finishCancel(Response.json({ ok: true }));
	await waitFor(() => expect(goto).toHaveBeenCalledWith(next, { invalidateAll: true }));
	expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/auth/mfa/enroll', '/api/auth/mfa/enroll/cancel']);
});

it.each([
	['a provider outage', () => Promise.resolve(Response.json({ error: 'Cancellation unavailable' }, { status: 503 }))],
	['a network failure', () => Promise.reject(new Error('Connection lost'))],
	['an unacknowledged success', () => Promise.resolve(Response.json({}))]
])('keeps setup on screen through %s and leaves once a retried cancel is confirmed', async (_, failedCancel) => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(ready())
		.mockImplementationOnce(failedCancel)
		.mockResolvedValueOnce(Response.json({ ok: true }));
	vi.stubGlobal('fetch', fetchMock);
	renderPage();
	await waitFor(() => expect(codeField()).toBeEnabled());
	await fireEvent.input(codeField(), { target: { value: '12' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Cancel setup' }));
	expect(await screen.findByRole('alert')).toBeVisible();
	expect(goto).not.toHaveBeenCalled();
	expect(screen.getByRole('img', { name: 'QR code for your authenticator app' })).toHaveAttribute(
		'src',
		'data:image/png;base64,AAAA'
	);
	expect(codeField()).toHaveValue('12');
	await fireEvent.click(screen.getByRole('button', { name: 'Cancel setup' }));
	await waitFor(() => expect(goto).toHaveBeenCalledWith(next, { invalidateAll: true }));
	expect(fetchMock.mock.calls.slice(1).map(([url, init]) => [url, init.body])).toEqual([
		['/api/auth/mfa/enroll/cancel', JSON.stringify({ factorId: 'factor-1' })],
		['/api/auth/mfa/enroll/cancel', JSON.stringify({ factorId: 'factor-1' })]
	]);
});

it('stays where the user went when a cancellation finishes after they leave the page', async () => {
	let finishCancel!: (response: Response) => void;
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(ready())
		.mockImplementationOnce(() => new Promise<Response>((resolve) => (finishCancel = resolve)));
	vi.stubGlobal('fetch', fetchMock);
	const view = renderPage();
	await waitFor(() => expect(codeField()).toBeEnabled());
	await fireEvent.click(screen.getByRole('button', { name: 'Cancel setup' }));
	expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/mfa/enroll/cancel', expect.anything());
	view.unmount();
	finishCancel(Response.json({ ok: true }));
	await vi.runAllTimersAsync();
	expect(goto).not.toHaveBeenCalled();
});
