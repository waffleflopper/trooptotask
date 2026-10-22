// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

import Layout from './+layout.svelte';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const children = createRawSnippet(() => ({ render: () => '<p>Dashboard page</p>' }));

describe('dashboard layout', () => {
	it('replaces the page with a retry when the workspace fails, and clears it on Organization navigation', async () => {
		const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
		let reject!: (reason: Error) => void;
		const failing = new Promise((_, rejectPromise) => (reject = rejectPromise));
		const view = render(Layout, { props: { data: { dashboard: { data: failing } }, children } });
		expect(screen.getByText('Dashboard page')).toBeTruthy();

		reject(new Error('Source unavailable'));

		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(screen.queryByText('Dashboard page')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry Dashboard' }));
		expect(reload).toHaveBeenCalledOnce();

		await view.rerender({ data: { dashboard: { data: new Promise(() => {}) } }, children });
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.getByText('Dashboard page')).toBeTruthy();
	});
});
