// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('/dashboard page', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: vi.fn(() => 'dark'),
				setItem: vi.fn(),
				removeItem: vi.fn(),
				clear: vi.fn()
			}
		});
		Object.defineProperty(window, 'localStorage', {
			configurable: true,
			value: {
				getItem: vi.fn(() => 'dark'),
				setItem: vi.fn(),
				removeItem: vi.fn(),
				clear: vi.fn()
			}
		});
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: false }))
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('hydrates the theme toggle without crashing when the organization chooser is forced visible', async () => {
		const { default: Page } = await import('./+page.svelte');

		expect(() =>
			render(Page, {
				props: {
					data: {
						session: null,
						organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'admin' }],
						pendingInvitations: []
					},
					form: null
				}
			})
		).not.toThrow();

		await fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
		expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeTruthy();
	});
});
