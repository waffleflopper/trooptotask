// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { themeStore } from '$lib/stores/theme.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { Toaster } from './index.js';

function preferSystemTheme(theme: 'light' | 'dark') {
	Object.defineProperty(window, 'matchMedia', {
		configurable: true,
		value: vi.fn((query: string) => ({
			matches: query === '(prefers-color-scheme: dark)' && theme === 'dark',
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn()
		}))
	});
}

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	toastStore.dismiss();
	cleanup();
	vi.restoreAllMocks();
});

describe('Toaster theme', () => {
	it('renders toasts in the app-selected theme, not the system preference, and follows a later selection', async () => {
		preferSystemTheme('light');
		themeStore.setTheme('dark');
		const { container } = render(Toaster);

		toastStore.success('Personnel saved');
		await screen.findByText('Personnel saved');
		const toaster = () => container.ownerDocument.querySelector('[data-sonner-toaster]');
		expect(toaster()?.getAttribute('data-sonner-theme')).toBe('dark');

		preferSystemTheme('dark');
		themeStore.setTheme('light');
		flushSync();
		expect(toaster()?.getAttribute('data-sonner-theme')).toBe('light');
	});
});
