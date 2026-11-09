// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import Recovery from './reset-password/+page.svelte';
import Invite from './accept-invite/+page.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({
	page: { data: { hasSession: false }, state: {}, url: new URL('http://localhost/'), shallow: null }
}));
afterEach(() => {
	cleanup();
	Object.assign(page, { data: { hasSession: false }, state: {}, url: new URL('http://localhost/') });
	window.history.replaceState({}, '', '/');
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

for (const [Page, path, label] of [
	[Recovery, '/auth/reset-password', /^New Password/],
	[Invite, '/auth/accept-invite', /^Password/]
] as const) {
	it(`${path} refuses an unverified provider fragment even when another session exists`, async () => {
		const fragment = '#access_token=synthetic-access&refresh_token=synthetic-refresh';
		Object.assign(page, { data: { hasSession: true }, state: {}, url: new URL(`http://localhost${path}${fragment}`) });
		window.history.replaceState({}, '', `${path}${fragment}`);
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		render(Page);
		expect(await screen.findByRole('alert')).toHaveTextContent('Request a fresh');
		expect(screen.queryByLabelText(label)).toBeNull();
		expect(goto).toHaveBeenCalledWith(path, { shallow: true, replace: true, state: {} });
		expect(fetchMock).not.toHaveBeenCalled();
	});
}
