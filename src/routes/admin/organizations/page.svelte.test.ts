// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';

const { goto, invalidateAll } = vi.hoisted(() => ({
	goto: vi.fn(async () => {}),
	invalidateAll: vi.fn(async () => {})
}));
vi.mock('$app/navigation', () => ({ goto, invalidateAll }));

import Page from './+page.svelte';

type PageProps = ComponentProps<typeof Page>;
type Directory = Awaited<PageProps['data']['directory']>;
type DirectoryPage = Extract<Directory, { status: 'ready' }>['page'];

afterEach(() => {
	cleanup();
	goto.mockClear();
	invalidateAll.mockClear();
});

function row(overrides: Partial<DirectoryPage['organizations'][number]> = {}): DirectoryPage['organizations'][number] {
	return {
		id: 'org-1',
		name: 'Able Company',
		createdAt: '2026-06-01T00:00:00.000Z',
		status: 'active',
		lastActiveAt: new Date().toISOString(),
		memberCount: 4,
		personnelCount: 31,
		ownerCount: 1,
		ownerEmail: 'owner@example.test',
		...overrides
	};
}

function directoryPage(overrides: Partial<DirectoryPage> = {}): Directory {
	const organizations = overrides.organizations ?? [row()];
	return {
		status: 'ready',
		page: {
			counts: { all: 38, activeWeek: 31, quiet: 4, suspended: 1 },
			organizations,
			totalCount: organizations.length,
			...overrides
		}
	};
}

function pageData(
	directory: Promise<Directory> | Directory,
	query: Partial<PageProps['data']['query']> = {}
): PageProps['data'] {
	return {
		query: { pages: 1, q: '', filter: 'all', ...query },
		directory: Promise.resolve(directory)
	} as PageProps['data'];
}

function renderPage(directory: Promise<Directory> | Directory, query: Partial<PageProps['data']['query']> = {}) {
	return render(Page, { props: { data: pageData(directory, query) } });
}

describe('admin organizations page', () => {
	it('counts the platform in the eyebrow only while nothing narrows the list', async () => {
		const many = Array.from({ length: 3 }, (_, index) => row({ id: `org-${index}`, name: `Unit ${index}` }));
		const { unmount } = renderPage(directoryPage({ organizations: many, totalCount: 38 }));
		expect(await screen.findByText('Platform · 38 Organizations')).toBeTruthy();
		unmount();
		renderPage(directoryPage({ organizations: many, totalCount: 2 }), { filter: 'suspended' });
		await screen.findByRole('link', { name: 'Unit 0' });
		expect(screen.getByText('Platform')).toBeTruthy();
		expect(screen.queryByText(/Platform ·/)).toBeNull();
	});
	it('shows each Organization with its owner and the facts the operator scans', async () => {
		renderPage(
			directoryPage({
				organizations: [
					row(),
					row({
						id: 'org-2',
						name: 'Baker Clinic',
						lastActiveAt: null,
						status: 'quiet',
						ownerEmail: null,
						ownerCount: 2
					})
				]
			})
		);
		const rows = await screen.findAllByRole('listitem');
		const able = within(rows[0]);
		expect(able.getByRole('link', { name: 'Able Company' }).getAttribute('href')).toBe('/admin/organizations/org-1');
		expect(able.getByText('owner@example.test')).toBeTruthy();
		expect(able.getByText('31')).toBeTruthy();
		expect(able.getByText('Active')).toBeTruthy();
		const baker = within(rows[1]);
		expect(baker.getByText('Never used')).toBeTruthy();
		expect(baker.getByText('Multiple owners')).toBeTruthy();
		expect(baker.getByText('Quiet')).toBeTruthy();
	});

	it('shows a skeleton while the page loads and then the rows', async () => {
		let finish!: (directory: Directory) => void;
		renderPage(
			new Promise<Directory>((resolve) => {
				finish = resolve;
			})
		);
		expect(screen.getByText('Loading organizations')).toBeTruthy();
		expect(screen.getByRole('searchbox', { name: 'Search' })).toBeTruthy();
		await act(() => finish(directoryPage()));
		expect(await screen.findByRole('link', { name: 'Able Company' })).toBeTruthy();
		expect(screen.queryByText('Loading organizations')).toBeNull();
	});

	it('keeps the toolbar and offers a retry when the page fails to load', async () => {
		renderPage({ status: 'failed' });
		await screen.findByText('Organizations could not be loaded.');
		expect(screen.getByRole('searchbox', { name: 'Search' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});

	it('says so when no Organization matches', async () => {
		renderPage(directoryPage({ organizations: [], totalCount: 0 }), { q: 'zzz' });
		expect(await screen.findByText('No matching Organizations.')).toBeTruthy();
		expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('zzz');
	});

	it('shows the search and filter held in the URL', async () => {
		renderPage(directoryPage(), { q: 'Able & Baker', filter: 'suspended' });
		expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('Able & Baker');
		expect(screen.getByRole('radio', { name: /^Suspended/ })).toBeChecked();
		await screen.findByRole('link', { name: 'Able Company' });
	});

	it('applies a filter from the first page and keeps the search', async () => {
		renderPage(directoryPage(), { q: 'Able', pages: 3 });
		await fireEvent.click(await screen.findByRole('radio', { name: /^Quiet 30\+ days/ }));
		expect(goto).toHaveBeenLastCalledWith('/admin/organizations?q=Able&filter=quiet', {
			keepFocus: true,
			noScroll: true
		});
	});

	it('applies the search once typing pauses and keeps the filter', async () => {
		vi.useFakeTimers();
		try {
			renderPage(directoryPage(), { filter: 'active-week' });
			const search = screen.getByRole('searchbox', { name: 'Search' });
			search.focus();
			await fireEvent.input(search, { target: { value: 'Able & Baker' } });
			expect(goto).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(300);
			expect(goto).toHaveBeenCalledOnce();
			expect(goto).toHaveBeenLastCalledWith('/admin/organizations?q=Able+%26+Baker&filter=active-week', {
				keepFocus: true,
				noScroll: true,
				replaceState: true
			});
			expect(document.activeElement).toBe(search);
		} finally {
			vi.useRealTimers();
		}
	});

	it('shows how many Organizations each filter lists once they are counted', async () => {
		let finish!: (directory: Directory) => void;
		renderPage(
			new Promise<Directory>((resolve) => {
				finish = resolve;
			})
		);
		expect(screen.getByRole('radio', { name: /^Quiet 30\+ days/ })).toBeTruthy();
		await act(() => finish(directoryPage()));
		expect(await screen.findByRole('radio', { name: 'All · 38' })).toBeTruthy();
		expect(screen.getByRole('radio', { name: 'Active this week · 31' })).toBeTruthy();
		expect(screen.getByRole('radio', { name: 'Quiet 30+ days · 4' })).toBeTruthy();
		expect(screen.getByRole('radio', { name: 'Suspended · 1' })).toBeTruthy();
	});

	it('leaves the chips uncounted when the list fails to load', async () => {
		renderPage({ status: 'failed' });
		await screen.findByText('Organizations could not be loaded.');
		expect(screen.getByRole('radio', { name: 'All' })).toBeTruthy();
	});

	it('loads one more page of rows, keeping the search and filter, and keeps the rows while it loads', async () => {
		const view = renderPage(directoryPage({ organizations: [row()], totalCount: 60 }), {
			q: 'Able',
			filter: 'suspended'
		});
		expect(await screen.findByText('Showing 1 of 60')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
		expect(goto).toHaveBeenLastCalledWith('/admin/organizations?pages=2&q=Able&filter=suspended', {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
		await view.rerender({
			data: pageData(new Promise<Directory>(() => {}), { pages: 2, q: 'Able', filter: 'suspended' })
		});
		expect(screen.getByRole('link', { name: 'Able Company' })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Load more/ })).toBeDisabled();
		expect(screen.queryByText('Loading organizations')).toBeNull();
	});

	it('offers no Load more once every Organization is shown', async () => {
		renderPage(directoryPage({ organizations: [row(), row({ id: 'org-2', name: 'Baker Clinic' })] }));
		expect(await screen.findByText('Showing 2 of 2')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
	});
});
