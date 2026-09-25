// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { writable, type Writable } from 'svelte/store';
import { page } from '$app/stores';
import { replaceState } from '$app/navigation';
import Recovery from '../../routes/auth/reset-password/+page.svelte';
import Invite from '../../routes/auth/accept-invite/+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/stores', () => ({ page: writable({ data: { hasSession: false }, state: {} }) }));
const store = page as unknown as Writable<{ data: { hasSession: boolean }; state: object }>;
afterEach(() => {
	cleanup();
	store.set({ data: { hasSession: false }, state: {} });
	window.history.replaceState({}, '', '/');
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

for (const [flow, Page, path, label] of [
	['recovery', Recovery, '/auth/reset-password', /^New Password/],
	['invite', Invite, '/auth/accept-invite', /^Password/]
] as const) {
	it.each(['network', 'provider', 'null', 'html'])(
		`${flow} keeps completion blocked after %s and serializes retry`,
		async (failure) => {
			window.history.replaceState({}, '', `${path}#access_token=synthetic-access&refresh_token=synthetic-refresh`);
			let finish!: (response: Response) => void;
			const fetchMock = vi.fn();
			if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('private transport detail'));
			else
				fetchMock.mockResolvedValueOnce(
					failure === 'provider'
						? Response.json({ error: 'private provider detail' }, { status: 503 })
						: failure === 'null'
							? Response.json(null)
							: new Response('<html>Unavailable</html>')
				);
			fetchMock.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						finish = resolve;
					})
			);
			if (flow === 'recovery')
				fetchMock.mockResolvedValueOnce(Response.json({ currentLevel: 'aal1', nextLevel: 'aal1' }));
			vi.stubGlobal('fetch', fetchMock);
			render(Page);
			expect(await screen.findByRole('alert')).not.toHaveTextContent('private');
			expect(screen.queryByLabelText(label)).toBeNull();
			expect(replaceState).not.toHaveBeenCalled();
			const retry = screen.getByRole('button', { name: 'Retry verification' });
			await fireEvent.click(retry);
			expect(retry).toBeDisabled();
			await fireEvent.click(retry);
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
			expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
				accessToken: 'synthetic-access',
				refreshToken: 'synthetic-refresh',
				flow
			});
			finish(Response.json({ ok: true }));
			expect(await screen.findByLabelText(label)).toBeEnabled();
			expect(replaceState).toHaveBeenCalledWith(path, {});
		}
	);

	it(`${flow} never exposes the existing account's password form when an incoming link is rejected`, async () => {
		store.set({ data: { hasSession: true }, state: {} });
		window.history.replaceState({}, '', `${path}#access_token=wrong-access&refresh_token=wrong-refresh`);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'invalid' }, { status: 401 })));
		render(Page);
		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(screen.queryByLabelText(label)).toBeNull();
		expect(replaceState).not.toHaveBeenCalled();
	});
}
