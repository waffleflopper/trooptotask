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
		[404, false],
		[403, false],
		[500, true],
		[503, true]
	])('shows a %i with Try again %s and a link back to the admin Dashboard', (status, retry) => {
		pageState.status = status;
		render(ErrorPage);

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(String(status));
		expect(screen.queryByRole('button', { name: 'Try again' }) !== null).toBe(retry);
		expect(screen.getByRole('link', { name: 'Back to Dashboard' }).getAttribute('href')).toBe('/admin');
	});

	it('offers Try again when a failed refresh lands here without an error status', () => {
		pageState.status = 200;
		render(ErrorPage);

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Error');
		expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Back to Dashboard' }).getAttribute('href')).toBe('/admin');
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
