// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('themeStore', () => {
	beforeEach(() => {
		vi.resetModules();
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
			value: globalThis.localStorage
		});
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: vi.fn(() => ({ matches: false }))
		});
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
