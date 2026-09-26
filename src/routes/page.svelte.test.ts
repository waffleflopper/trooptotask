// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('landing FAQ', () => {
	it('exposes one answer at a time through its trigger and keeps access available without an observer', async () => {
		vi.stubGlobal('IntersectionObserver', undefined);
		const { container } = render(Page, { props: { data: { session: null, user: null } } });
		const main = within(container.querySelector('main')!);
		const first = main.getByRole('button', { name: /Are the calendar statuses fixed/i });
		const second = main.getByRole('button', { name: /Can I scope access/i });
		const firstAnswer = document.getElementById(first.getAttribute('aria-controls')!);
		const secondAnswer = document.getElementById(second.getAttribute('aria-controls')!);

		expect(first).toHaveAttribute('aria-expanded', 'false');
		expect(firstAnswer).toHaveAttribute('hidden');
		expect(secondAnswer).toHaveAttribute('hidden');
		expect(main.getByRole('heading', { name: /Know your formation/i })).toBeVisible();
		expect(main.getAllByRole('link', { name: 'Request Access' })).toHaveLength(2);

		await fireEvent.click(first);
		expect(first).toHaveAttribute('aria-expanded', 'true');
		expect(firstAnswer).not.toHaveAttribute('hidden');

		await fireEvent.click(second);
		expect(first).toHaveAttribute('aria-expanded', 'false');
		expect(firstAnswer).toHaveAttribute('hidden');
		expect(second).toHaveAttribute('aria-expanded', 'true');
		expect(secondAnswer).not.toHaveAttribute('hidden');

		await fireEvent.click(second);
		expect(second).toHaveAttribute('aria-expanded', 'false');
		expect(secondAnswer).toHaveAttribute('hidden');
	});

	it('keeps the admitted-user dashboard destinations', () => {
		vi.stubGlobal('IntersectionObserver', undefined);
		const { container } = render(Page, {
			props: {
				data: {
					session: null,
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
