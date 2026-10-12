// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('landing FAQ', () => {
	it('opens one answer at a time and lets the open one close, without an intersection observer', async () => {
		vi.stubGlobal('IntersectionObserver', undefined);
		const { container } = render(Page, { props: { data: { viewer: null, user: null } } });
		const main = within(container.querySelector('main')!);
		const first = main.getByRole('button', { name: /Are the calendar statuses fixed/i });
		const second = main.getByRole('button', { name: /Can I scope access/i });

		expect(first).toHaveAttribute('aria-expanded', 'false');
		expect(second).toHaveAttribute('aria-expanded', 'false');
		expect(main.getByText(/You define every status yourself/)).not.toBeVisible();
		expect(main.getByRole('heading', { name: /Know your formation/i })).toBeVisible();

		await fireEvent.click(first);
		expect(first).toHaveAttribute('aria-expanded', 'true');
		expect(main.getByText(/You define every status yourself/)).toBeVisible();

		await fireEvent.click(second);
		expect(second).toHaveAttribute('aria-expanded', 'true');
		expect(first).toHaveAttribute('aria-expanded', 'false');
		expect(main.getByText(/Group-scoped access can let leaders/)).toBeVisible();
		await waitFor(() => expect(main.getByText(/You define every status yourself/)).not.toBeVisible());

		await fireEvent.click(second);
		expect(second).toHaveAttribute('aria-expanded', 'false');
		await waitFor(() => expect(main.getByText(/Group-scoped access can let leaders/)).not.toBeVisible());
	});

	it('sends a visitor to reviewed access from the hero and the closing call to action', () => {
		vi.stubGlobal('IntersectionObserver', undefined);
		const { container } = render(Page, { props: { data: { viewer: null, user: null } } });
		const main = within(container.querySelector('main')!);

		const links = main.getAllByRole('link', { name: 'Request Access' });
		expect(links).toHaveLength(2);
		for (const link of links) expect(link).toHaveAttribute('href', '/auth/request-access');
	});

	it('keeps the admitted-user dashboard destinations', () => {
		vi.stubGlobal('IntersectionObserver', undefined);
		const { container } = render(Page, {
			props: {
				data: {
					viewer: null,
					user: {
						id: 'synthetic-user',
						app_metadata: {},
						user_metadata: {},
						aud: 'authenticated',
						created_at: '2026-09-25T00:00:00Z'
					}
				}
			}
		});
		const main = within(container.querySelector('main')!);
		expect(main.getAllByRole('link', { name: /dashboard/i })).toHaveLength(2);
		expect(main.queryByRole('link', { name: 'Request Access' })).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard?show=all');
	});
});
