// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { writable, type Writable } from 'svelte/store';
import { page } from '$app/stores';
import { replaceState } from '$app/navigation';
import Recovery from './reset-password/+page.svelte';
import Invite from './accept-invite/+page.svelte';

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

for (const [Page, path, label] of [
	[Recovery, '/auth/reset-password', /^New Password/],
	[Invite, '/auth/accept-invite', /^Password/]
] as const) {
	it(`${path} refuses an unverified provider fragment even when another session exists`, async () => {
		store.set({ data: { hasSession: true }, state: {} });
		window.history.replaceState({}, '', `${path}#access_token=synthetic-access&refresh_token=synthetic-refresh`);
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		render(Page);
		expect(await screen.findByRole('alert')).toHaveTextContent('Request a fresh');
		expect(screen.queryByLabelText(label)).toBeNull();
		expect(replaceState).toHaveBeenCalledWith(path, {});
		expect(fetchMock).not.toHaveBeenCalled();
	});
}
