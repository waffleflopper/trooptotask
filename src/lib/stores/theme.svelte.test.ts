// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('themeStore', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubGlobal('localStorage', {
			getItem: vi.fn(() => 'dark'),
			setItem: vi.fn(),
			removeItem: vi.fn(),
			clear: vi.fn()
		});
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: false }))
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('keeps the initial client render aligned with server markup until mounted', async () => {
		const { themeStore } = await import('./theme.svelte');

		expect(themeStore.current).toBe('light');

		themeStore.init();

		expect(themeStore.current).toBe('dark');
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
	});
});
