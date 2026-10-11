// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import ErrorPage from './+error.svelte';

const { pageState } = vi.hoisted(() => ({ pageState: { status: 404, params: {} as Record<string, string> } }));
vi.mock('$app/state', () => ({ page: pageState }));

afterEach(() => {
	cleanup();
});

describe('root error screen', () => {
	it.each([404, 403, 500])('shows the %i status and links home', (status) => {
		pageState.status = status;
		render(ErrorPage);

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(String(status));
		expect(screen.getByRole('link', { name: 'Go Home' }).getAttribute('href')).toBe('/');
	});

	it.each([404, 403])('offers no retry for a %i', (status) => {
		pageState.status = status;
		render(ErrorPage);

		expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
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
