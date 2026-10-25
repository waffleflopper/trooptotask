// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ActivityPage, ActivityQuery } from '../activityQuery';
import type { AuditEventRecord } from '../auditSentences';
import ActivityView from './ActivityView.svelte';

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

const navigations: Promise<unknown>[] = [];

afterEach(async () => {
	await Promise.all(navigations.splice(0));
	cleanup();
	goto.mockReset();
});

type ActivityLoader = (query: ActivityQuery, timeZone: string, signal: AbortSignal) => Promise<ActivityPage>;
const loader = () => vi.fn<ActivityLoader>();

const TIME_ZONE = 'America/Los_Angeles';
const TODAY = new Date('2026-10-22T20:00:00Z');
const BASE_QUERY: ActivityQuery = { category: null, q: '', from: '', to: '', page: 1 };

function event(overrides: Partial<AuditEventRecord> & Pick<AuditEventRecord, 'id' | 'timestamp'>): AuditEventRecord {
	return {
		action: 'suspend_user',
		severity: 'critical',
		userId: 'user-1',
		orgId: null,
		orgName: null,
		resourceType: 'user',
		resourceId: '11111111-2222-3333-4444-555555555555',
		ipAddress: null,
		details: { actorEmail: 'robert@example.test', targetName: 'pat@example.test', reason: 'Policy hold' },
		...overrides
	};
}

const EVENTS = [
	event({ id: 'late', timestamp: '2026-10-22T05:30:00Z' }),
	event({
		id: 'org',
		timestamp: '2026-10-22T04:00:00Z',
		action: 'suspend_org',
		orgId: 'org-1',
		orgName: 'Alpha Company',
		resourceType: 'organization',
		resourceId: 'org-1',
		details: { actorEmail: 'robert@example.test' }
	}),
	event({
		id: 'unknown',
		timestamp: '2026-10-21T05:00:00Z',
		action: 'admin.brand.new',
		severity: 'info',
		details: null
	})
];

function pageOf(events: AuditEventRecord[], totalCount = events.length, page = 1): ActivityPage {
	return { events, page, pageSize: 50, totalCount };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function renderView(load: Mock<ActivityLoader>, query: ActivityQuery = BASE_QUERY) {
	const view = render(ActivityView, { query, timeZone: TIME_ZONE, load, today: TODAY });
	goto.mockImplementation((href: string) => {
		const params = new URL(href, 'http://localhost').searchParams;
		const landed = Promise.resolve().then(() =>
			view.rerender({
				query: {
					category: (params.get('category') as ActivityQuery['category']) ?? null,
					q: params.get('q') ?? '',
					from: params.get('from') ?? '',
					to: params.get('to') ?? '',
					page: Number(params.get('page') ?? 1)
				},
				timeZone: TIME_ZONE,
				load,
				today: TODAY
			})
		);
		navigations.push(landed);
		return landed;
	});
	return view;
}

describe('ActivityView', () => {
	it('shows a skeleton until the page arrives, then days and sentences in the viewer time zone', async () => {
		const reply = deferred<ActivityPage>();
		renderView(loader().mockReturnValue(reply.promise));

		expect(screen.getByTestId('activity-skeleton')).toBeTruthy();
		expect(screen.getByRole('region', { name: 'Activity events' }).getAttribute('aria-busy')).toBe('true');

		reply.resolve(pageOf(EVENTS));

		await screen.findByText('robert@example.test suspended pat@example.test');
		expect(screen.queryByTestId('activity-skeleton')).toBeNull();
		expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent?.trim())).toEqual([
			'Wednesday, October 21, 2026',
			'Tuesday, October 20, 2026'
		]);
		expect(screen.getByText('robert@example.test suspended Alpha Company')).toBeTruthy();
		expect(screen.getAllByText('admin.brand.new').map((node) => node.tagName)).toContain('P');
		expect(screen.getByText('3 events')).toBeTruthy();
		expect(goto).not.toHaveBeenCalled();
	});

	it('marks warning and critical rows for assistive technology and leaves info rows unmarked', async () => {
		renderView(loader().mockResolvedValue(pageOf(EVENTS)));

		const rows = await screen.findAllByRole('listitem');
		expect(rows.map((row) => within(row).queryByText(/^(Info|Warning|Critical)$/)?.textContent ?? null)).toEqual([
			'Critical',
			'Critical',
			null
		]);
	});

	it('shows a retryable load error and keeps the filters, then loads on retry', async () => {
		const load = loader().mockRejectedValueOnce(new Error('private detail')).mockResolvedValueOnce(pageOf(EVENTS));
		renderView(load, { ...BASE_QUERY, q: 'pat' });

		await screen.findByText('Unable to load Activity');
		expect(screen.queryByText('private detail')).toBeNull();
		expect(screen.getByLabelText<HTMLInputElement>('Search').value).toBe('pat');

		await fireEvent.click(screen.getByRole('button', { name: 'Retry Activity' }));

		await screen.findByText('robert@example.test suspended pat@example.test');
		expect(load).toHaveBeenCalledTimes(2);
		expect(screen.queryByText('Unable to load Activity')).toBeNull();
	});

	it('ignores a reply that lands after the filters moved on', async () => {
		const first = deferred<ActivityPage>();
		const second = deferred<ActivityPage>();
		const load = loader().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		renderView(load);

		await fireEvent.click(screen.getByRole('radio', { name: 'Security' }));
		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		expect(load.mock.calls[1][0]).toMatchObject({ category: 'security' });
		expect(load.mock.calls[0][2].aborted).toBe(true);

		second.resolve(pageOf([EVENTS[2]]));
		await screen.findByText('1 event');
		first.resolve(pageOf([EVENTS[0]]));
		await Promise.resolve();

		expect(screen.queryByText('robert@example.test suspended pat@example.test')).toBeNull();
		expect(screen.getByText('1 event')).toBeTruthy();
	});

	it('does not let a late failure replace a newer page', async () => {
		const first = deferred<ActivityPage>();
		const second = deferred<ActivityPage>();
		const load = loader().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		renderView(load);

		await fireEvent.click(screen.getByRole('radio', { name: 'Access' }));
		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		second.resolve(pageOf([EVENTS[1]]));
		await screen.findByText('robert@example.test suspended Alpha Company');
		first.reject(new Error('late'));
		await Promise.resolve();

		expect(screen.queryByText('Unable to load Activity')).toBeNull();
		expect(screen.getByText('robert@example.test suspended Alpha Company')).toBeTruthy();
	});

	it('puts the category, the debounced search and a date preset in the address', async () => {
		renderView(loader().mockResolvedValue(pageOf(EVENTS)), { ...BASE_QUERY, page: 3 });
		await screen.findAllByRole('listitem');

		await fireEvent.click(screen.getByRole('radio', { name: 'Accounts' }));
		expect(goto).toHaveBeenLastCalledWith('/admin/activity?category=accounts', {
			keepFocus: true,
			noScroll: true,
			replaceState: undefined
		});

		await fireEvent.input(screen.getByLabelText('Search'), { target: { value: ' Alpha ' } });
		await waitFor(() =>
			expect(goto).toHaveBeenLastCalledWith('/admin/activity?category=accounts&q=Alpha', {
				keepFocus: true,
				noScroll: true,
				replaceState: true
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
		await waitFor(() =>
			expect(goto).toHaveBeenLastCalledWith('/admin/activity?category=accounts&q=Alpha&from=2026-10-16&to=2026-10-22', {
				keepFocus: true,
				noScroll: true,
				replaceState: undefined
			})
		);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Start' }).textContent).toContain('Oct 16, 2026'));
	});

	it('clears the filters from the empty state', async () => {
		renderView(loader().mockResolvedValue(pageOf([])), { ...BASE_QUERY, category: 'security', q: 'nobody' });

		await screen.findByText('No activity matches these filters.');
		await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

		expect(goto).toHaveBeenLastCalledWith('/admin/activity', {
			keepFocus: true,
			noScroll: true,
			replaceState: undefined
		});
	});

	it('says there is no activity yet when nothing is filtered', async () => {
		renderView(loader().mockResolvedValue(pageOf([])));

		await screen.findByText('No activity yet.');
		expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
	});

	it('discloses labeled details for a row and never raw JSON', async () => {
		renderView(loader().mockResolvedValue(pageOf([EVENTS[0]])));

		const trigger = await screen.findByRole('button', {
			name: 'Details: robert@example.test suspended pat@example.test'
		});
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(screen.getByText('Policy hold').closest('[data-slot="collapsible-content"]')?.hasAttribute('hidden')).toBe(
			true
		);

		await fireEvent.click(trigger);

		const reason = screen.getByText('Policy hold');
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
		expect(reason.closest('[data-slot="collapsible-content"]')?.hasAttribute('hidden')).toBe(false);
		expect(reason.previousElementSibling?.textContent).toBe('Reason');
		expect(screen.getByText('Action').nextElementSibling?.textContent).toBe('suspend_user');
		expect(document.body.textContent).not.toContain('{');
	});

	it('pages with links that carry the current filters', async () => {
		renderView(loader().mockResolvedValue(pageOf(EVENTS, 120)), { ...BASE_QUERY, category: 'access' });

		await screen.findAllByRole('listitem');
		expect(screen.getByText('Page 1 of 3')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Next' }));

		expect(goto).toHaveBeenLastCalledWith('/admin/activity?category=access&page=2', { keepFocus: true });
	});
});
