// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { stringify } from 'devalue';
import { redirectToSensitiveActionStepUp } from '$features/identity';
import TransferOwnershipModal from './TransferOwnershipModal.svelte';

vi.mock('$features/identity', () => ({ redirectToSensitiveActionStepUp: vi.fn(() => false) }));
// Supply the empty framework decoder registry; the action envelope uses real deserialize.
vi.mock('../../../../node_modules/@sveltejs/kit/src/runtime/server/app.js', () => ({ app: { decoders: {} } }));
vi.mock('../../../../node_modules/@sveltejs/kit/src/runtime/client/client.js', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	app: { decoders: {} }
}));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function props() {
	return {
		orgId: 'org-alpha',
		orgName: 'Alpha Clinic',
		members: [
			{ userId: 'owner-alpha', email: 'owner@example.test', role: 'owner' },
			{ userId: 'member-alpha', email: 'member@example.test', role: 'member' }
		],
		onClose: vi.fn(),
		onComplete: vi.fn(async () => {}),
		onReload: vi.fn(async () => ({ ownerUserId: 'owner-alpha', targetIsEligible: true }))
	};
}
function actionResponse(
	type: 'success' | 'failure',
	data: Record<string, unknown>,
	status = type === 'failure' ? 400 : 200,
	httpStatus = status
) {
	return Response.json({ type, status, data: stringify(data) }, { status: httpStatus });
}
async function confirm() {
	await fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'member-alpha' } });
	await fireEvent.input(screen.getByLabelText('Type Alpha Clinic to confirm'), { target: { value: 'Alpha Clinic' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }));
}

it.each([400, 403, 404, 409])(
	'preserves a decoded %s action denial draft for retry even over HTTP 200',
	async (status) => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(
				actionResponse('failure', { error: { message: 'Organization name does not match' } }, status, 200)
			)
			.mockResolvedValueOnce(actionResponse('success', { success: true }));
		vi.stubGlobal('fetch', fetch);
		const callbacks = props();
		render(TransferOwnershipModal, callbacks);
		await confirm();
		expect(await screen.findByText('Organization name does not match')).toBeTruthy();
		expect((screen.getByLabelText('New owner') as HTMLSelectElement).value).toBe('member-alpha');
		expect((screen.getByLabelText('Type Alpha Clinic to confirm') as HTMLInputElement).value).toBe('Alpha Clinic');
		expect(callbacks.onComplete).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }));
		await screen.findByRole('button', { name: 'Reload details' });
		expect(callbacks.onComplete).toHaveBeenCalledWith('org-alpha', 'member-alpha');
		expect(callbacks.onReload).not.toHaveBeenCalled();
	}
);

it.each([
	['rejected fetch', () => Promise.reject(new Error('reply lost'))],
	[
		'malformed decoder input',
		() => Promise.resolve(new Response(JSON.stringify({ type: 'success', status: 200, data: 'not devalue' })))
	],
	[
		'provider failure',
		() => Promise.resolve(actionResponse('failure', { error: { message: 'Provider unavailable' } }, 503))
	],
	['unacknowledged success', () => Promise.resolve(actionResponse('success', { success: false }))]
] as const)('requires a fresh read before another transfer after %s', async (_name, reply) => {
	const fetch = vi
		.fn()
		.mockImplementationOnce(reply)
		.mockResolvedValueOnce(actionResponse('success', { success: true }));
	vi.stubGlobal('fetch', fetch);
	const callbacks = props();
	callbacks.onReload.mockRejectedValueOnce(new Error('read unavailable'));
	render(TransferOwnershipModal, callbacks);
	await confirm();
	await screen.findByRole('button', { name: 'Reload details' });
	expect(screen.queryByRole('button', { name: 'Transfer ownership' })).toBeNull();
	expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
	expect(callbacks.onReload).not.toHaveBeenCalled();
	expect(fetch).toHaveBeenCalledTimes(1);
	await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
	await screen.findByText(/Details could not be refreshed/);
	expect(screen.queryByRole('button', { name: 'Transfer ownership' })).toBeNull();
	expect(fetch).toHaveBeenCalledTimes(1);
	await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
	await screen.findByText(/Details refreshed/);
	expect(callbacks.onReload).toHaveBeenLastCalledWith('org-alpha', 'member-alpha');
	expect((screen.getByLabelText('New owner') as HTMLSelectElement).value).toBe('member-alpha');
	expect((screen.getByLabelText('Type Alpha Clinic to confirm') as HTMLInputElement).value).toBe('Alpha Clinic');
	expect(callbacks.onComplete).not.toHaveBeenCalled();
	expect(fetch).toHaveBeenCalledTimes(1);
	await fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }));
	await waitFor(() => expect(callbacks.onComplete).toHaveBeenCalledWith('org-alpha', 'member-alpha'));
	expect(fetch).toHaveBeenCalledTimes(2);
});

it('closes on a current target owner read without announcing that the uncertain transfer succeeded', async () => {
	const fetch = vi.fn().mockRejectedValue(new Error('reply lost'));
	vi.stubGlobal('fetch', fetch);
	const callbacks = props();
	callbacks.onReload.mockResolvedValue({ ownerUserId: 'member-alpha', targetIsEligible: false });
	render(TransferOwnershipModal, callbacks);
	await confirm();
	await screen.findByRole('button', { name: 'Reload details' });
	await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
	await waitFor(() => expect(callbacks.onClose).toHaveBeenCalled());
	expect(callbacks.onComplete).not.toHaveBeenCalled();
	expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
	{ ownerUserId: 'third-owner', targetIsEligible: true },
	{ ownerUserId: 'owner-alpha', targetIsEligible: false }
])('refuses a stale retry after ownership or membership changes: %j', async (current) => {
	const fetch = vi.fn().mockRejectedValue(new Error('reply lost'));
	vi.stubGlobal('fetch', fetch);
	const callbacks = props();
	callbacks.onReload.mockResolvedValue(current);
	render(TransferOwnershipModal, callbacks);
	await confirm();
	await screen.findByRole('button', { name: 'Reload details' });
	await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
	await screen.findByRole('button', { name: 'Close and review' });
	expect(screen.queryByRole('button', { name: 'Transfer ownership' })).toBeNull();
	expect((screen.getByLabelText('New owner') as HTMLSelectElement).disabled).toBe(true);
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(callbacks.onComplete).not.toHaveBeenCalled();
});

it('forwards the existing Identity step-up fields without completing a transfer', async () => {
	vi.mocked(redirectToSensitiveActionStepUp).mockReturnValueOnce(true);
	const fields = { requiresStepUp: true, stepUpPath: '/auth/mfa-verify', error: { message: 'Confirm your identity' } };
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(actionResponse('failure', fields)));
	const callbacks = props();
	render(TransferOwnershipModal, callbacks);
	await confirm();
	expect(redirectToSensitiveActionStepUp).toHaveBeenCalledWith(fields);
	expect(callbacks.onComplete).not.toHaveBeenCalled();
});

it('reports an acknowledged transfer separately from a failed refresh and prevents repeating it', async () => {
	const fetch = vi.fn().mockResolvedValue(actionResponse('success', { success: true }));
	vi.stubGlobal('fetch', fetch);
	const callbacks = props();
	callbacks.onComplete.mockRejectedValue(new Error('refresh failed'));
	render(TransferOwnershipModal, callbacks);
	await confirm();
	expect(await screen.findByText(/Transferred, but the details could not be refreshed/)).toBeTruthy();
	expect(screen.getByRole('button', { name: 'Reload details' })).toBeTruthy();
	expect(screen.queryByRole('button', { name: 'Transfer ownership' })).toBeNull();
	expect(fetch).toHaveBeenCalledTimes(1);
});

it('requires the exact organization name rather than silently accepting extra whitespace', async () => {
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	render(TransferOwnershipModal, props());
	await fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'member-alpha' } });
	await fireEvent.input(screen.getByLabelText('Type Alpha Clinic to confirm'), { target: { value: ' Alpha Clinic ' } });
	expect((screen.getByRole('button', { name: 'Transfer ownership' }) as HTMLButtonElement).disabled).toBe(true);
	expect(fetch).not.toHaveBeenCalled();
});

it('keeps the pressed Transfer ownership focusable and busy while held, and sends nothing on another press', async () => {
	let reply!: (response: Response) => void;
	const fetch = vi.fn(() => new Promise<Response>((resolve) => (reply = resolve)));
	vi.stubGlobal('fetch', fetch);
	render(TransferOwnershipModal, props());
	await fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'member-alpha' } });
	await fireEvent.input(screen.getByLabelText('Type Alpha Clinic to confirm'), { target: { value: 'Alpha Clinic' } });
	const transfer = screen.getByRole('button', { name: 'Transfer ownership' });
	transfer.focus();
	await fireEvent.click(transfer);
	expect(screen.getByRole('button', { name: /Transferring/ })).toBe(transfer);
	expect(transfer).toHaveProperty('disabled', false);
	expect(transfer.getAttribute('aria-busy')).toBe('true');
	expect(document.activeElement).toBe(transfer);
	await fireEvent.click(transfer);
	expect(fetch).toHaveBeenCalledOnce();
	reply(actionResponse('failure', { error: { message: 'Organization name does not match' } }));
	expect(await screen.findByText('Organization name does not match')).toBeTruthy();
	expect(transfer.getAttribute('aria-busy')).toBeNull();
});
