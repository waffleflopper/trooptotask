// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import ErrorPage from './+error.svelte';

const { pageState } = vi.hoisted(() => ({ pageState: { status: 500, params: { orgId: 'alpha' } } }));
vi.mock('$app/state', () => ({ page: pageState }));

afterEach(() => {
	cleanup();
});

describe('Critical Tasks error screen', () => {
	it('shows a failed Critical Tasks read as the workspace load error with Retry', () => {
		pageState.status = 500;
		render(ErrorPage);

		expect(screen.getByRole('alert').textContent).toContain('Unable to load Critical Tasks');
		expect(screen.getByRole('button', { name: 'Retry Critical Tasks' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: '500' })).toBeNull();
	});

	it('keeps the Organization not-found screen for a missing record', () => {
		pageState.status = 404;
		render(ErrorPage);

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('404');
		expect(screen.getByRole('link', { name: 'Back to Dashboard' }).getAttribute('href')).toBe('/org/alpha');
		expect(screen.queryByRole('alert')).toBeNull();
	});
});
