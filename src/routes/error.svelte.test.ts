// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import ErrorPage from './+error.svelte';

const { pageState } = vi.hoisted(() => ({ pageState: { status: 404, params: {} as Record<string, string> } }));
vi.mock('$app/state', () => ({ page: pageState }));

afterEach(() => {
	cleanup();
});

describe('root error screen', () => {
	it.each([
		[404, "Page not found. The page you're looking for doesn't exist or has been moved."],
		[403, "You don't have permission to view this page."],
		[500, 'Something went wrong. Please try again later.']
	])('explains a %i and links home', (status, message) => {
		pageState.status = status;
		render(ErrorPage);

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(String(status));
		expect(screen.getByText(message)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Go Home' }).getAttribute('href')).toBe('/');
	});
});
