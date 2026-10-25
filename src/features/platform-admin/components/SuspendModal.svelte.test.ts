// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import SuspendModal from './SuspendModal.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function props() {
	return {
		type: 'user' as const,
		targetId: 'user-alpha',
		targetName: 'alpha@example.test',
		isSuspended: false,
		onClose: vi.fn(),
		onComplete: vi.fn(async () => {}),
		onReload: vi.fn(async () => false)
	};
}

it.each([400, 403, 404, 409])('retains a known %s denial draft for explicit retry', async (status) => {
	const fetch = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ message: 'Change denied' }, { status }))
		.mockResolvedValueOnce(Response.json({ success: true }));
	vi.stubGlobal('fetch', fetch);
	const callbacks = props();
	render(SuspendModal, callbacks);
	const reason = screen.getByLabelText('Reason (optional)');
	await fireEvent.input(reason, { target: { value: 'synthetic reason' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
	expect(await screen.findByText('Change denied')).toBeTruthy();
	expect((reason as HTMLTextAreaElement).value).toBe('synthetic reason');
	expect(callbacks.onComplete).not.toHaveBeenCalled();
	await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
	await screen.findByRole('button', { name: 'Reload details' });
	expect(callbacks.onComplete).toHaveBeenCalledWith('user-alpha', true);
	expect(callbacks.onReload).not.toHaveBeenCalled();
	expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([
	['rejected fetch', () => Promise.reject(new Error('connection lost'))],
	['unreadable acknowledgement', () => Promise.resolve(new Response('not JSON'))],
	['provider failure', () => Promise.resolve(Response.json({ message: 'Provider unavailable' }, { status: 503 }))],
	['unacknowledged response', () => Promise.resolve(Response.json({ success: false }))]
] as const)('requires a fresh read before another dispatch after %s', async (_name, reply) => {
	const fetch = vi
		.fn()
		.mockImplementationOnce(reply)
		.mockResolvedValueOnce(Response.json({ success: true }));
	vi.stubGlobal('fetch', fetch);
	const callbacks = props();
	callbacks.onReload.mockRejectedValueOnce(new Error('read unavailable'));
	render(SuspendModal, callbacks);
	await fireEvent.input(screen.getByLabelText('Reason (optional)'), { target: { value: 'retained draft' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
	await screen.findByRole('button', { name: 'Reload details' });
	expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
	expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
	expect(callbacks.onReload).not.toHaveBeenCalled();
	expect(fetch).toHaveBeenCalledTimes(1);
	await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
	await screen.findByText(/Details could not be refreshed/);
	expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
	expect(fetch).toHaveBeenCalledTimes(1);
	await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
	await screen.findByText(/Details refreshed/);
	expect(callbacks.onReload).toHaveBeenLastCalledWith('user-alpha');
	expect((screen.getByLabelText('Reason (optional)') as HTMLTextAreaElement).value).toBe('retained draft');
	expect(callbacks.onComplete).not.toHaveBeenCalled();
	expect(fetch).toHaveBeenCalledTimes(1);
	await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
	await waitFor(() => expect(callbacks.onComplete).toHaveBeenCalledWith('user-alpha', true));
	expect(fetch).toHaveBeenCalledTimes(2);
});

it('closes on an already suspended read without claiming the uncertain operation succeeded', async () => {
	const fetch = vi.fn().mockRejectedValue(new Error('reply lost'));
	vi.stubGlobal('fetch', fetch);
	const callbacks = props();
	callbacks.onReload.mockResolvedValue(true);
	render(SuspendModal, callbacks);
	await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
	await screen.findByRole('button', { name: 'Reload details' });
	await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
	await waitFor(() => expect(callbacks.onClose).toHaveBeenCalled());
	expect(callbacks.onComplete).not.toHaveBeenCalled();
	expect(fetch).toHaveBeenCalledTimes(1);
});

it('does not reconcile an old target after the modal props change during the read', async () => {
	vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('reply lost')));
	let finish!: (state: boolean) => void;
	const callbacks = props();
	callbacks.onReload.mockImplementation(
		() =>
			new Promise<boolean>((resolve) => {
				finish = resolve;
			})
	);
	const view = render(SuspendModal, callbacks);
	await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
	await screen.findByRole('button', { name: 'Reload details' });
	await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
	await view.rerender({ ...callbacks, targetId: 'user-beta' });
	finish(true);
	await waitFor(() =>
		expect((screen.getByRole('button', { name: 'Reload details' }) as HTMLButtonElement).disabled).toBe(false)
	);
	expect(callbacks.onClose).not.toHaveBeenCalled();
	expect(callbacks.onComplete).not.toHaveBeenCalled();
	expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
});

it('distinguishes an acknowledged save from a failed detail refresh and prevents another save', async () => {
	const fetch = vi.fn().mockResolvedValue(Response.json({ success: true }));
	vi.stubGlobal('fetch', fetch);
	const callbacks = props();
	callbacks.onComplete.mockRejectedValue(new Error('read unavailable'));
	render(SuspendModal, callbacks);
	await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
	expect(await screen.findByText(/Saved, but the details could not be refreshed/)).toBeTruthy();
	expect(screen.getByRole('button', { name: 'Reload details' })).toBeTruthy();
	expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
	expect(fetch).toHaveBeenCalledTimes(1);
});

it('does not complete an unacknowledged HTTP 200 response', async () => {
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: false })));
	const callbacks = props();
	render(SuspendModal, callbacks);
	await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
	expect(await screen.findByText(/The change could not be confirmed/)).toBeTruthy();
	expect(callbacks.onComplete).not.toHaveBeenCalled();
});

it('keeps the pressed Suspend focusable and busy while the change is held, and sends nothing on another press', async () => {
	let reply!: (response: Response) => void;
	const fetch = vi.fn(() => new Promise<Response>((resolve) => (reply = resolve)));
	vi.stubGlobal('fetch', fetch);
	render(SuspendModal, props());
	const suspend = screen.getByRole('button', { name: 'Suspend' });
	suspend.focus();
	await fireEvent.click(suspend);
	const busy = screen.getByRole('button', { name: /Processing/ });
	expect(busy).toBe(suspend);
	expect(suspend).toHaveProperty('disabled', false);
	expect(suspend.getAttribute('aria-busy')).toBe('true');
	expect(document.activeElement).toBe(suspend);
	await fireEvent.click(suspend);
	expect(fetch).toHaveBeenCalledOnce();
	reply(Response.json({ message: 'Change denied' }, { status: 409 }));
	expect(await screen.findByText('Change denied')).toBeTruthy();
	expect(suspend.getAttribute('aria-busy')).toBeNull();
});

function stubLocation() {
	const location = {
		origin: 'https://app.example.test',
		pathname: '/admin/users/user-alpha',
		search: '?tab=1',
		href: ''
	};
	vi.stubGlobal('location', location);
	return location;
}

it.each([
	['/auth/mfa-verify', 'https://app.example.test/auth/mfa-verify?next=%2Fadmin%2Fusers%2Fuser-alpha%3Ftab%3D1'],
	['/auth/mfa-setup', 'https://app.example.test/auth/mfa-setup?next=%2Fadmin%2Fusers%2Fuser-alpha%3Ftab%3D1']
])('sends the operator to %s and back when the server asks for step-up', async (stepUpPath, destination) => {
	const location = stubLocation();
	const fetch = vi
		.fn()
		.mockResolvedValue(Response.json({ message: 'Verify again', requiresStepUp: true, stepUpPath }, { status: 403 }));
	vi.stubGlobal('fetch', fetch);
	const callbacks = props();
	render(SuspendModal, callbacks);
	await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
	await waitFor(() => expect(location.href).toBe(destination));
	expect(screen.getByText(/Nothing has been changed yet/)).toBeTruthy();
	expect(screen.getByRole('button', { name: /Verifying/ }).getAttribute('aria-busy')).toBe('true');
	expect(screen.queryByText('Verify again')).toBeNull();
	expect(callbacks.onComplete).not.toHaveBeenCalled();
	await fireEvent.click(screen.getByRole('button', { name: /Verifying/ }));
	expect(fetch).toHaveBeenCalledOnce();
});

it('sends an unsuspend through the same step-up', async () => {
	const location = stubLocation();
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(Response.json({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' }, { status: 403 }))
	);
	render(SuspendModal, { ...props(), isSuspended: true });
	await fireEvent.click(screen.getByRole('button', { name: 'Unsuspend' }));
	await waitFor(() => expect(location.href).toContain('/auth/mfa-verify?next='));
});

it('offers another try when the browser returns from an abandoned step-up', async () => {
	stubLocation();
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(Response.json({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' }, { status: 403 }))
	);
	render(SuspendModal, props());
	await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
	await screen.findByRole('button', { name: /Verifying/ });
	window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
	expect(await screen.findByText(/Multi-factor verification was not completed/)).toBeTruthy();
	expect(screen.getByRole('button', { name: 'Suspend' }).getAttribute('aria-busy')).toBeNull();
});

it('does not redirect the current page when the modal closed before the step-up reply arrived', async () => {
	const location = stubLocation();
	let reply!: (response: Response) => void;
	vi.stubGlobal(
		'fetch',
		vi.fn(() => new Promise<Response>((resolve) => (reply = resolve)))
	);
	const view = render(SuspendModal, props());
	await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
	view.unmount();
	reply(Response.json({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' }, { status: 403 }));
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(location.href).toBe('');
});
