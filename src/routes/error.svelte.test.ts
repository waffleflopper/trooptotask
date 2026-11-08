// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import ErrorPage from './+error.svelte';

const { pageState } = vi.hoisted(() => ({
	pageState: { status: 404, params: {} as Record<string, string>, data: {} as Record<string, unknown> }
}));
vi.mock('$app/state', () => ({ page: pageState }));

afterEach(() => {
	cleanup();
	pageState.data = {};
});

describe('root error screen', () => {
	it.each([404, 403, 500])('shows the %i status and links home', (status) => {
		pageState.status = status;
		render(ErrorPage);

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(String(status));
		expect(screen.getByRole('link', { name: 'Go Home' }).getAttribute('href')).toBe('/');
		expect(screen.getAllByRole('main')).toHaveLength(1);
	});

	it.each([
		{ name: 'a signed-in person goes to their landing', data: { viewer: { userId: 'user-1' } }, href: '/dashboard' },
		{
			name: 'a person inside an Organization goes to its home',
			data: { viewer: { userId: 'user-1' }, shell: { org: { urlSegment: '1-11-bde' } } },
			href: '/org/1-11-bde'
		}
	])('sends $name', ({ data, href }) => {
		pageState.status = 500;
		pageState.data = data;
		render(ErrorPage);

		expect(screen.getByRole('link', { name: 'Go Home' }).getAttribute('href')).toBe(href);
	});

	it.each([404, 403])('offers no retry for a %i', (status) => {
		pageState.status = status;
		render(ErrorPage);

		expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
	});

	it('offers Try again when a failed refresh lands here without an error status', () => {
		pageState.status = 200;
		render(ErrorPage);

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Error');
		expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
	});

	it('reloads the requested page from Try again after a server failure', async () => {
		pageState.status = 503;
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });
		render(ErrorPage);

		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

		expect(reload).toHaveBeenCalledOnce();
		vi.unstubAllGlobals();
	});
});
