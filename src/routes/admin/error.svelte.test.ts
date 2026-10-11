// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import ErrorPage from './+error.svelte';

const { pageState } = vi.hoisted(() => ({ pageState: { status: 404 } }));
vi.mock('$app/state', () => ({ page: pageState }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('Platform admin error screen', () => {
	it.each([
		[404, "Page not found. The page you're looking for doesn't exist or has been moved."],
		[403, "You don't have permission to view this page."],
		[503, 'This admin page could not be loaded. Please try again.']
	])('explains a %i and returns to the admin Dashboard', (status, message) => {
		pageState.status = status;
		render(ErrorPage);

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(String(status));
		expect(screen.getByText(message)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Back to Dashboard' }).getAttribute('href')).toBe('/admin');
	});

	it.each([404, 403])('offers no retry for a %i', (status) => {
		pageState.status = status;
		render(ErrorPage);

		expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
	});

	it('reloads the page from Try again after a failed load', async () => {
		pageState.status = 503;
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });
		render(ErrorPage);

		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

		expect(reload).toHaveBeenCalledOnce();
	});
});
