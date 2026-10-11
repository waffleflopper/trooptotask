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
		const { container } = render(Page, { props: { data: { session: null, user: null } } });
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
		const { container } = render(Page, { props: { data: { session: null, user: null } } });
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

describe('landing scroll reveal', () => {
	function stubObservers() {
		const observers: { callback: IntersectionObserverCallback; targets: Element[] }[] = [];
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				targets: Element[] = [];
				constructor(public callback: IntersectionObserverCallback) {
					observers.push(this);
				}
				observe(target: Element) {
					this.targets.push(target);
				}
				unobserve() {}
				disconnect() {}
			}
		);
		return observers;
	}

	it('arms the reveal when motion is allowed and marks a section revealed as it enters view', async () => {
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: true }))
		);
		const observers = stubObservers();
		const { container } = render(Page, { props: { data: { session: null, user: null } } });

		const main = container.querySelector('main')!;
		await waitFor(() => expect(main).toHaveClass('reveal-enabled'));
		const reveal = observers.find((observer) =>
			observer.targets.some((target) => target.classList.contains('reveal'))
		)!;
		const target = reveal.targets[0];
		reveal.callback([{ isIntersecting: true, target } as unknown as IntersectionObserverEntry], reveal as never);
		expect(target).toHaveClass('revealed');
	});

	it('leaves content visible when the visitor prefers reduced motion', async () => {
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: false }))
		);
		stubObservers();
		const { container } = render(Page, { props: { data: { session: null, user: null } } });

		await Promise.resolve();
		expect(container.querySelector('main')).not.toHaveClass('reveal-enabled');
	});
});
