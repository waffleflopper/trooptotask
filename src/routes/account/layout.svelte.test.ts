// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openToolbarMore, stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import Layout from './+layout.svelte';

const navigation = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => navigation);
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('$app/environment', () => ({ browser: true }));

const children = createRawSnippet(() => ({ render: () => '<p>Account content</p>' }));

function renderLayout() {
	render(Layout, { props: { data: { accountPathname: '/account/profile' } as never, children } });
}

function stubHistory(length: number) {
	const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
	vi.spyOn(window.history, 'length', 'get').mockReturnValue(length);
	return back;
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	navigation.goto.mockReset();
});

describe('account layout toolbar', () => {
	it('goes back in history when there is a previous page', async () => {
		const back = stubHistory(3);
		renderLayout();

		await fireEvent.click(
			within(screen.getByRole('toolbar', { name: 'Account controls' })).getByRole('button', { name: 'Back' })
		);

		expect(back).toHaveBeenCalledOnce();
		expect(navigation.goto).not.toHaveBeenCalled();
	});

	it('opens the dashboard when the account page is the first page of the session', async () => {
		const back = stubHistory(1);
		renderLayout();

		await fireEvent.click(screen.getByRole('button', { name: 'Back' }));

		expect(navigation.goto).toHaveBeenCalledWith('/dashboard');
		expect(back).not.toHaveBeenCalled();
	});

	it('folds Back into More like any other action when the toolbar is as narrow as it gets', async () => {
		const widths = stubToolbarWidths();
		const back = stubHistory(2);
		renderLayout();
		await widths.foldAll();

		const toolbar = within(screen.getByRole('toolbar', { name: 'Account controls' }));
		expect(toolbar.queryByRole('button', { name: 'Back' })).toBeNull();
		const menu = await openToolbarMore('Account controls');
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Back' }));
		await waitFor(() => expect(back).toHaveBeenCalledOnce());
	});

	it('keeps the section tabs and the page content', () => {
		renderLayout();

		expect(screen.getByRole('heading', { name: 'Account' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('aria-current')).toBe('page');
		expect(screen.getByText('Account content')).toBeTruthy();
	});
});
