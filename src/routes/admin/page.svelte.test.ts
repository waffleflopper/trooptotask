// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { InboxItem, InboxKind, InboxSourceResult, InboxStatsResult } from '$features/platform-admin/inboxTypes';

const { goto, invalidate, location } = vi.hoisted(() => ({
	goto: vi.fn(),
	invalidate: vi.fn(),
	location: { url: new URL('http://localhost/admin') }
}));
vi.mock('$app/navigation', () => ({ goto, invalidate, beforeNavigate: vi.fn(), afterNavigate: vi.fn() }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return location.url;
		}
	}
}));
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => {} }) }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

import Page from './+page.svelte';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const FEEDBACK_ID = '22222222-2222-4222-8222-222222222222';

const request: InboxItem = {
	kind: 'accessRequest',
	id: REQUEST_ID,
	title: 'Sam Rivera',
	summary: 'sam@example.test',
	receivedAt: '2026-10-29T08:00:00Z',
	closedAt: null,
	outcome: null
};
const feedback: InboxItem = {
	kind: 'feedback',
	id: FEEDBACK_ID,
	title: 'The roster will not load',
	summary: 'member@example.test',
	receivedAt: '2026-10-30T08:00:00Z',
	lastActivityAt: '2026-10-30T08:00:00Z',
	closedAt: null,
	category: 'bug'
};

type Sources = { [K in InboxKind]: Promise<InboxSourceResult<K>> };
const ok = <K extends InboxKind>(
	items: InboxSourceResult<K> extends infer R ? (R extends { items: infer I } ? I : never) : never
) => Promise.resolve({ status: 'ok', count: (items as unknown[]).length, items } as InboxSourceResult<K>);

function pageData(
	overrides: Partial<{ tab: 'open' | 'done'; sources: Sources; stats: Promise<InboxStatsResult> }> = {}
) {
	return {
		tab: 'open' as const,
		inboxOpenCount: Promise.resolve<number | null>(2),
		stats: Promise.resolve<InboxStatsResult>({ status: 'ok', newPeople: 4, newOrganizations: 2 }),
		sources: {
			setupEmailFailed: ok<'setupEmailFailed'>([]),
			accessRequest: ok<'accessRequest'>([request as never]),
			feedback: ok<'feedback'>([feedback as never])
		} satisfies Sources,
		...overrides
	};
}

const itemLinks = () => {
	const list = screen.queryByRole('list', { name: /^(Open|Done) items$/ });
	return list ? within(list).getAllByRole('link') : [];
};
const rowTitles = () => itemLinks().map((link) => link.querySelector('[id$="-title"]')?.textContent);

beforeEach(() => {
	goto.mockResolvedValue(undefined);
	location.url = new URL('http://localhost/admin');
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify({ status: 'notFound' })))
	);
});
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
	vi.unstubAllGlobals();
});

describe('Inbox page', () => {
	it('lists open items of every kind, newest first, with counts on the kind filter', async () => {
		render(Page, { props: { data: pageData() as never } });

		await waitFor(() => expect(rowTitles()).toEqual(['The roster will not load', 'Sam Rivera']));
		const filter = screen.getByRole('radiogroup', { name: 'Filter by kind' });
		expect(within(filter).getByRole('radio', { name: 'All · 2' })).toBeTruthy();
		expect(within(filter).getByRole('radio', { name: 'Access · 1' })).toBeTruthy();
		expect(within(filter).getByRole('radio', { name: 'Feedback · 1' })).toBeTruthy();
	});

	it('shows only the chosen kind', async () => {
		location.url = new URL('http://localhost/admin?kind=accessRequest');
		render(Page, { props: { data: pageData() as never } });

		await waitFor(() => expect(rowTitles()).toEqual(['Sam Rivera']));
	});

	it('shows a skeleton, not an empty state, until the sources answer', () => {
		const pending = new Promise<never>(() => {});
		render(Page, {
			props: {
				data: pageData({
					sources: { setupEmailFailed: ok<'setupEmailFailed'>([]), accessRequest: pending, feedback: pending }
				}) as never
			}
		});

		expect(screen.getByRole('status', { name: 'Loading Inbox' })).toBeTruthy();
		expect(itemLinks()).toEqual([]);
	});

	it('keeps the other kind visible when one source fails, and retries by re-reading', async () => {
		render(Page, {
			props: {
				data: pageData({
					sources: {
						setupEmailFailed: ok<'setupEmailFailed'>([]),
						accessRequest: Promise.resolve({ status: 'error' }),
						feedback: ok<'feedback'>([feedback as never])
					}
				}) as never
			}
		});

		await waitFor(() => expect(rowTitles()).toEqual(['The roster will not load']));
		expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

		expect(invalidate).toHaveBeenCalledWith('admin:inbox');
	});

	it('does not claim zero when a count is unknown', async () => {
		render(Page, {
			props: {
				data: pageData({
					sources: {
						setupEmailFailed: ok<'setupEmailFailed'>([]),
						accessRequest: Promise.resolve({ status: 'error' }),
						feedback: ok<'feedback'>([feedback as never])
					}
				}) as never
			}
		});

		await waitFor(() => expect(rowTitles()).toEqual(['The roster will not load']));
		const filter = screen.getByRole('radiogroup', { name: 'Filter by kind' });
		expect(within(filter).getByRole('radio', { name: 'All' })).toBeTruthy();
		expect(within(filter).getByRole('radio', { name: 'Access' })).toBeTruthy();
	});

	it('shows the month figures, and no figure at all when the stats fail', async () => {
		const figures = () => within(screen.getByLabelText('This month'));
		const view = render(Page, { props: { data: pageData() as never } });
		await waitFor(() => expect(figures().getByText('4')).toBeTruthy());
		expect(figures().getByText('2')).toBeTruthy();
		view.unmount();

		render(Page, { props: { data: pageData({ stats: Promise.resolve({ status: 'error' }) }) as never } });
		await waitFor(() => expect(screen.getByRole('button', { name: 'Retry figures' })).toBeTruthy());
		expect(figures().queryByText('0')).toBeNull();
		expect(figures().queryByText('4')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Retry figures' }));
		expect(invalidate).toHaveBeenCalledWith('admin:inbox');
	});

	it('opens an item by pushing history, so Back closes it', async () => {
		render(Page, { props: { data: pageData() as never } });
		await waitFor(() => expect(rowTitles()).toHaveLength(2));

		await fireEvent.click(screen.getByRole('link', { name: 'Sam Rivera' }));

		expect(goto).toHaveBeenCalledWith(
			`/admin?item=accessRequest%3A${REQUEST_ID}`,
			expect.objectContaining({ replace: false })
		);
	});

	it('changes the kind filter without adding history', async () => {
		render(Page, { props: { data: pageData() as never } });
		await waitFor(() => expect(rowTitles()).toHaveLength(2));

		await fireEvent.click(screen.getByRole('radio', { name: /^Feedback/ }));

		expect(goto).toHaveBeenCalledWith('/admin?kind=feedback', expect.objectContaining({ replace: true }));
	});

	it('switches to Done without keeping an item from the Open tab', async () => {
		location.url = new URL(`http://localhost/admin?item=feedback%3A${FEEDBACK_ID}`);
		render(Page, { props: { data: pageData() as never } });

		await fireEvent.click(screen.getByRole('tab', { name: 'Done' }));

		expect(goto).toHaveBeenCalledWith('/admin?tab=done', expect.objectContaining({ replace: true }));
	});

	it('shows the Done skeleton at once while its read is still on the way, never the Open rows', async () => {
		goto.mockReturnValue(new Promise(() => {}));
		render(Page, { props: { data: pageData() as never } });
		await waitFor(() => expect(itemLinks().length).toBeGreaterThan(0));

		await fireEvent.click(screen.getByRole('tab', { name: 'Done' }));

		expect(screen.getByRole('status', { name: 'Loading Inbox' })).toBeTruthy();
		expect(itemLinks()).toEqual([]);
		expect(screen.getByRole('tab', { name: 'Done' }).getAttribute('aria-selected')).toBe('true');
	});

	it('counts Done items on the Done chips while the sentence keeps the open count', async () => {
		const sentence = () => document.querySelector('[data-slot="page-header-subtitle"]')?.textContent?.trim();
		render(Page, { props: { data: pageData() as never } });
		await waitFor(() => expect(sentence()).toBeTruthy());
		const onOpen = sentence();
		cleanup();

		render(Page, {
			props: {
				data: pageData({
					tab: 'done',
					sources: {
						setupEmailFailed: ok<'setupEmailFailed'>([]),
						accessRequest: ok<'accessRequest'>([]),
						feedback: ok<'feedback'>([{ ...feedback, closedAt: '2026-10-30T09:00:00Z' } as never])
					}
				}) as never
			}
		});

		await waitFor(() => expect(sentence()).toBe(onOpen));
		const filter = screen.getByRole('radiogroup', { name: 'Filter by kind' });
		expect(await within(filter).findByRole('radio', { name: 'All · 1' })).toBeTruthy();
		expect(within(filter).getByRole('radio', { name: 'Feedback · 1' })).toBeTruthy();
	});

	it('shows an empty Done tab as empty rather than loading', async () => {
		render(Page, {
			props: {
				data: pageData({
					tab: 'done',
					sources: {
						setupEmailFailed: ok<'setupEmailFailed'>([]),
						accessRequest: ok<'accessRequest'>([]),
						feedback: ok<'feedback'>([])
					}
				}) as never
			}
		});

		await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading Inbox' })).toBeNull());
		expect(screen.getByRole('tabpanel', { name: 'Done' }).textContent?.trim()).not.toBe('');
		expect(itemLinks()).toEqual([]);
		expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
	});
});
