// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import { Toaster, UpdateAvailableNotice } from './index.js';

const app = vi.hoisted(() => ({
	updated: undefined as { set(value: boolean): void } | undefined,
	navigate: undefined as ((navigation: unknown) => unknown) | undefined
}));

vi.mock('$app/state', async () => {
	const { SvelteMap } = await import('svelte/reactivity');
	const flag = new SvelteMap<'updated', boolean>([['updated', false]]);
	app.updated = { set: (value) => void flag.set('updated', value) };
	return {
		updated: {
			get current() {
				return flag.get('updated') ?? false;
			}
		}
	};
});

vi.mock('$app/navigation', () => ({
	onNavigate: (callback: (navigation: unknown) => unknown) => {
		app.navigate = callback;
	}
}));

const location = { href: 'https://app.example.test/org/alpha/personnel', reload: vi.fn() };

beforeEach(() => {
	vi.stubGlobal('location', location);
});

afterEach(() => {
	toastStore.dismiss();
	cleanup();
	app.updated?.set(false);
	location.href = 'https://app.example.test/org/alpha/personnel';
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

function link(href: string) {
	return { type: 'link', to: { url: new URL(href) } };
}

describe('update available toast', () => {
	it('stays hidden until a new version is detected, then offers Refresh and Later once', async () => {
		render(Toaster);
		render(UpdateAvailableNotice);
		expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();

		app.updated?.set(true);
		flushSync();
		await screen.findByRole('button', { name: 'Refresh' });
		expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();

		cleanup();
		render(Toaster);
		render(UpdateAvailableNotice);
		await screen.findByRole('button', { name: 'Refresh' });
		expect(screen.getAllByRole('button', { name: 'Refresh' })).toHaveLength(1);
	});

	it('reloads on Refresh, and keeps the toast so a cancelled leave prompt can be retried', async () => {
		render(Toaster);
		render(UpdateAvailableNotice);
		app.updated?.set(true);
		flushSync();

		await fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }));

		expect(location.reload).toHaveBeenCalledOnce();
		expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
	});

	it('dismisses on Later without reloading and does not come back on its own', async () => {
		render(Toaster);
		render(UpdateAvailableNotice);
		app.updated?.set(true);
		flushSync();

		await fireEvent.click(await screen.findByRole('button', { name: 'Later' }));

		await waitFor(() => expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull());
		expect(location.reload).not.toHaveBeenCalled();
	});
});

describe('full page load for the next link once an update is waiting', () => {
	it('loads the link target as a document and parks the in-app navigation', () => {
		render(UpdateAvailableNotice);
		app.updated?.set(true);
		flushSync();

		const result = app.navigate?.(link('https://app.example.test/org/alpha/calendar'));

		expect(location.href).toBe('https://app.example.test/org/alpha/calendar');
		expect(result).toBeInstanceOf(Promise);
	});

	it.each([
		['no update is waiting', false, link('https://app.example.test/org/alpha/calendar')],
		[
			'a programmatic goto',
			true,
			{ type: 'goto', to: { url: new URL('https://app.example.test/org/alpha/calendar') } }
		],
		['browser Back', true, { type: 'popstate', to: { url: new URL('https://app.example.test/org/alpha/calendar') } }],
		['a form submission', true, { type: 'form', to: { url: new URL('https://app.example.test/org/alpha/calendar') } }]
	])('leaves the navigation in-app for %s', (_name, updated, navigation) => {
		render(UpdateAvailableNotice);
		app.updated?.set(updated);
		flushSync();

		const result = app.navigate?.(navigation);

		expect(result).toBeUndefined();
		expect(location.href).toBe('https://app.example.test/org/alpha/personnel');
	});
});
