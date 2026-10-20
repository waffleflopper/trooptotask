// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { themeStore } from '$lib/stores/theme.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { Toaster } from './index.js';
import ToasterOverDialogTest from './ToasterOverDialogTest.svelte';
import ToasterTest from './ToasterTest.svelte';

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
	function toastNamed(text: string) {
		return screen.getAllByRole('listitem').find((toast) => toast.textContent?.includes(text)) as HTMLElement;
	}

	it('announces stacked toasts in a labelled polite region and dismisses only the chosen toast', async () => {
		render(ToasterTest);

		toastStore.success('Personnel updated');
		toastStore.error('Failed to update personnel');
		const region = (await screen.findByText('Personnel updated')).closest('section');
		await screen.findByText('Failed to update personnel');

		expect(region?.getAttribute('aria-live')).toBe('polite');
		expect(region?.getAttribute('aria-label')).toMatch(/^Notifications/);
		expect(within(region as HTMLElement).getAllByRole('listitem')).toHaveLength(2);

		const dismiss = within(toastNamed('Failed to update personnel')).getByRole('button', { name: 'Close toast' });
		expect(dismiss.tabIndex).toBe(0);
		await fireEvent.click(dismiss);

		await waitFor(() => expect(screen.queryByText('Failed to update personnel')).toBeNull());
		expect(screen.getByText('Personnel updated')).toBeTruthy();
	});

	it('moves focus to the next toast, then back to where the user came from, as toasts are dismissed', async () => {
		render(ToasterTest);
		const edit = screen.getByRole('button', { name: 'Edit Able' });

		toastStore.success('Personnel updated');
		toastStore.success('Group renamed');
		await screen.findByText('Group renamed');
		await screen.findByText('Personnel updated');

		const first = within(toastNamed('Group renamed')).getByRole('button', { name: 'Close toast' });
		const second = within(toastNamed('Personnel updated')).getByRole('button', { name: 'Close toast' });
		edit.focus();
		await fireEvent.focusIn(first, { relatedTarget: edit });
		first.focus();

		await fireEvent.click(first);
		expect(document.activeElement).toBe(second);

		await fireEvent.click(second);
		expect(document.activeElement).toBe(edit);
		await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(0));
	});

	it('keeps a toast with an action open while keyboard focus is inside it and dismisses it after focus leaves', async () => {
		render(ToasterTest);
		const edit = screen.getByRole('button', { name: 'Edit Able' });

		toastStore.success('Unit name changed to Alpha.', 300, { label: 'Undo', onClick: vi.fn() });
		const undo = await screen.findByRole('button', { name: 'Undo' });
		await fireEvent.focusIn(undo, { relatedTarget: edit });
		undo.focus();

		await new Promise((resolve) => setTimeout(resolve, 800));
		expect(screen.getByText('Unit name changed to Alpha.')).toBeTruthy();

		await fireEvent.focusOut(undo, { relatedTarget: edit });
		await waitFor(() => expect(screen.queryByText('Unit name changed to Alpha.')).toBeNull(), { timeout: 2000 });
	});

	it('keeps an open dialog when a toast is pressed, while a press elsewhere still closes it', async () => {
		render(ToasterOverDialogTest);
		toastStore.success('Personnel updated');
		const toast = (await screen.findByText('Personnel updated')).closest('li') as HTMLElement;
		const outside = { clientX: 5, clientY: 5 };

		await fireEvent.pointerDown(within(toast).getByRole('button', { name: 'Close toast' }), outside);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(screen.getByRole('dialog', { name: 'Edit person' })).toBeTruthy();

		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Page content' }), outside);
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('moves focus only to a toast that is still visible when more toasts exist than are shown', async () => {
		render(Toaster, { visibleToasts: 1 });

		toastStore.success('Older');
		toastStore.success('Newer');
		await screen.findByText('Newer');
		await screen.findByText('Older');
		const hidden = toastNamed('Older');

		const front = within(toastNamed('Newer')).getByRole('button', { name: 'Close toast' });
		front.focus();
		await fireEvent.click(front);

		expect(hidden.contains(document.activeElement)).toBe(false);
	});
});
