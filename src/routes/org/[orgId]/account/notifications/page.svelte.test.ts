// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import type { Notification } from '$features/notifications/contracts';
import Page from './+page.svelte';

const { goto, invalidateAll } = vi.hoisted(() => ({
	goto: vi.fn(async () => {}),
	invalidateAll: vi.fn(async () => {})
}));

vi.mock('$app/navigation', () => ({ goto, invalidateAll }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({ orgId: 'org-1', orgUrlSegment: 'alpha', refreshNotifications: () => {} })
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

const notification = (id: string, title: string): Notification => ({
	id,
	user_id: 'user-1',
	organization_id: null,
	type: 'feedback_reply',
	title,
	message: '',
	link: `/account/feedback/${id}`,
	read: false,
	created_at: '2026-10-24T12:00:00Z'
});

it('holds every open control while a delete is pending, then opens and marks the next item read', async () => {
	let finishDelete = () => {};
	const fetch = vi.fn((_url: string, init: RequestInit) =>
		init.method === 'DELETE'
			? new Promise<Response>((done) => (finishDelete = () => done(new Response(null, { status: 200 }))))
			: Promise.resolve(new Response(null, { status: 200 }))
	);
	vi.stubGlobal('fetch', fetch);
	render(Page, {
		props: { data: { notifications: [notification('a', 'First reply'), notification('b', 'Second reply')] } } as never
	});
	const openSecond = () => screen.getByRole('button', { name: /^Second reply/ }) as HTMLButtonElement;

	await fireEvent.click(screen.getByRole('button', { name: 'Delete notification: First reply' }));
	expect(openSecond().disabled).toBe(true);
	await fireEvent.click(openSecond());
	expect(goto).not.toHaveBeenCalled();

	finishDelete();
	await waitFor(() => expect(screen.queryByRole('button', { name: /^First reply/ })).toBeNull());
	expect(openSecond().disabled).toBe(false);
	await fireEvent.click(openSecond());

	expect(goto).toHaveBeenCalledWith('/org/alpha/account/feedback/b');
	expect(fetch).toHaveBeenLastCalledWith('/org/alpha/api/notifications', expect.objectContaining({ method: 'PUT' }));
	expect(JSON.parse(fetch.mock.lastCall![1].body as string)).toEqual({ id: 'b' });
});

it('shows a failed read as a retryable error inside the page instead of an empty list', async () => {
	render(Page, { props: { data: { notifications: null } } as never });

	expect(screen.getByRole('alert').textContent).toContain('Unable to load notifications');
	expect(screen.queryByText(/^No notifications/)).toBeNull();
	await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
	expect(invalidateAll).toHaveBeenCalledTimes(1);
});
