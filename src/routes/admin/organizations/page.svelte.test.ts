// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';

const { goto, invalidateAll } = vi.hoisted(() => ({
	goto: vi.fn(async () => {}),
	invalidateAll: vi.fn(async () => {})
}));
vi.mock('$app/navigation', () => ({ goto, invalidateAll }));

import { stubToolbarWidths } from '$lib/test-support/toolbarWidths';
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
		page: { organizations, page: 1, pageSize: 25, totalCount: organizations.length, totalPages: 1, ...overrides }
	};
}

function pageData(
	directory: Promise<Directory> | Directory,
	query: Partial<PageProps['data']['query']> = {}
): PageProps['data'] {
	return {
		query: { page: 1, q: '', filter: 'all', ...query },
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
		expect(baker.getByText('Quiet >30 days')).toBeTruthy();
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
		const widths = stubToolbarWidths();
		renderPage(directoryPage(), { q: 'Able & Baker', filter: 'suspended' });
		await widths.layOut(1000);
		const toolbar = within(screen.getByRole('toolbar', { name: 'Organizations controls' }));
		expect(toolbar.getByRole('searchbox', { name: 'Search' })).toHaveValue('Able & Baker');
		expect(toolbar.getByRole('button', { name: 'Suspended', pressed: true })).toBeTruthy();
		await screen.findByRole('link', { name: 'Able Company' });
	});

	it('applies a filter from the first page and keeps the search', async () => {
		const widths = stubToolbarWidths();
		renderPage(directoryPage(), { q: 'Able', page: 3 });
		await widths.layOut(1000);
		await fireEvent.click(screen.getByRole('button', { name: 'Quiet 30+ days' }));
		expect(goto).toHaveBeenLastCalledWith('/admin/organizations?q=Able&filter=quiet', { keepFocus: true });
		await screen.findByRole('link', { name: 'Able Company' });
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
				keepFocus: true
			});
			expect(document.activeElement).toBe(search);
		} finally {
			vi.useRealTimers();
		}
	});

	it('pages with buttons that keep the search and filter and report the range', async () => {
		renderPage(directoryPage({ organizations: [row()], page: 2, pageSize: 25, totalCount: 60, totalPages: 3 }), {
			page: 2,
			q: 'Able',
			filter: 'suspended'
		});
		expect(await screen.findByText('Showing 26-26 of 60')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(goto).toHaveBeenCalledWith('/admin/organizations?page=3&q=Able&filter=suspended', { keepFocus: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
		await waitFor(() =>
			expect(goto).toHaveBeenLastCalledWith('/admin/organizations?q=Able&filter=suspended', { keepFocus: true })
		);
	});
});
