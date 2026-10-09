// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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

describe('Toaster announcements and dismissal', () => {
	it('announces stacked toasts in a labelled polite region and dismisses only the chosen toast', async () => {
		render(Toaster);

		toastStore.success('Personnel updated');
		toastStore.error('Failed to update personnel');
		const region = (await screen.findByText('Personnel updated')).closest('section');
		await screen.findByText('Failed to update personnel');

		expect(region?.getAttribute('aria-live')).toBe('polite');
		expect(region?.getAttribute('aria-label')).toMatch(/^Notifications/);
		const toasts = within(region as HTMLElement).getAllByRole('listitem');
		expect(toasts.map((toast) => toast.textContent?.trim())).toEqual(
			expect.arrayContaining([
				expect.stringContaining('Failed to update personnel'),
				expect.stringContaining('Personnel updated')
			])
		);

		const errorToast = toasts.find((toast) => toast.textContent?.includes('Failed to update personnel'));
		const dismiss = within(errorToast as HTMLElement).getByRole('button', { name: 'Close toast' });
		expect(dismiss.tabIndex).toBe(0);
		await fireEvent.click(dismiss);

		await waitFor(() => expect(screen.queryByText('Failed to update personnel')).toBeNull());
		expect(screen.getByText('Personnel updated')).toBeTruthy();
	});
});
