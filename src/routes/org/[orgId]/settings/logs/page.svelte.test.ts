// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditLogFilters } from '$lib/audit/auditLogFilters';
import type { AuditLogEntry, AuditLogQueryResult } from '$lib/audit/contracts';
import type { LogsFilterOptions } from '../settingsSectionTypes';

const { goto, invalidateAll } = vi.hoisted(() => ({
	goto: vi.fn(async () => {}),
	invalidateAll: vi.fn(async () => {})
}));
vi.mock('$app/navigation', () => ({ goto, invalidateAll }));
vi.mock('$app/state', () => ({ page: { params: { orgId: 'test-org' } } }));

import Page from './+page.svelte';

const PERSON = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const CURSOR = '2026-10-15T12:00:00.000000+00:00_33333333-3333-4333-8333-333333333333';

const OPTIONS: LogsFilterOptions = {
	people: [
		{ id: PERSON, label: 'SGT Rivera, Sam', archived: false },
		{ id: '44444444-4444-4444-8444-444444444444', label: 'SPC Able, Jane', archived: true }
	],
	members: [{ userId: MEMBER, label: 'SSG Doe, Pat' }],
	actions: ['org.renamed', 'availability.deleted']
};

afterEach(() => {
	cleanup();
	goto.mockClear();
	invalidateAll.mockClear();
	vi.unstubAllGlobals();
});

type Row = Pick<AuditLogEntry, 'action' | 'createdAt'> & Partial<AuditLogEntry>;

function entriesOf(rows: Row[], idPrefix = 'audit'): AuditLogEntry[] {
	return rows.map((row, index) => ({
		id: `${idPrefix}-${index}`,
		userId: 'user-1',
		actor: 'dana@army.mil',
		resourceType: null,
		resourceId: null,
		details: null,
		recordLabel: null,
		subject: null,
		batchId: null,
		...row
	}));
}

interface Setup {
	rows?: Row[];
	nextCursor?: string | null;
	filters?: AuditLogFilters;
	auditLog?: Promise<AuditLogQueryResult>;
	options?: Promise<LogsFilterOptions>;
}

function pageData({ rows = [], nextCursor = null, filters = {}, auditLog, options }: Setup) {
	return {
		logsSettings: {
			timeZone: 'America/New_York',
			today: '2026-10-19',
			filters,
			auditLog: auditLog ?? Promise.resolve({ logs: entriesOf(rows), nextCursor })
		},
		filterOptions: options ?? Promise.resolve(OPTIONS)
	} as never;
}

async function renderLogs(setup: Setup = {}) {
	const view = render(Page, { props: { data: pageData(setup), form: null, params: { orgId: 'test-org' } } });
	const table = within(await screen.findByRole('table', { name: 'Organization audit log entries' }));
	return { ...view, table };
}

function statusText(): string {
	return (screen.getByRole('status').textContent ?? '').replace(/\s+/g, ' ').trim();
}

type Day = { title: string; count: string; entries: string[] };

/** Each day head on the page with its entry count and the instants of the rows under it, in order. */
function days(table: ReturnType<typeof within>): Day[] {
	const result: Day[] = [];
	for (const row of table.getAllByRole('row').slice(1)) {
		const head = row.querySelector('th[scope="colgroup"]');
		if (head) {
			const [title, detail] = Array.from(head.children, (part: Element) => part.textContent?.trim() ?? '');
			result.push({ title, count: /(\d+\+?) entr/.exec(detail)?.[1] ?? '', entries: [] });
		} else {
			result.at(-1)?.entries.push(row.querySelector('time')?.getAttribute('datetime') ?? '');
		}
	}
	return result;
}

function actors(table: ReturnType<typeof within>): string[] {
	return table
		.getAllByRole('row')
		.filter((row: HTMLElement) => row.querySelector('time'))
		.map((row: HTMLElement) => row.querySelectorAll('td')[3]?.textContent?.trim() ?? '');
}

const MIXED: Row[] = [
	{
		action: 'organization.settings_updated',
		createdAt: '2026-10-20T03:30:00Z',
		details: { previous_disabled_features: [], disabled_features: ['training'] }
	},
	{
		action: 'deletion_request.approved',
		createdAt: '2026-10-19T17:05:00Z',
		details: { subject_type: 'training_record', subject_label: 'Weapons Qualification' }
	},
	{ action: 'member.invite', createdAt: '2026-10-18T22:00:00Z', details: { email: 'b***@army.mil' } },
	{
		action: 'personnel.updated',
		createdAt: '2026-10-15T12:00:00Z',
		details: { subject_label: 'SPC Reed' },
		userId: null,
		actor: null
	}
];

describe('logs settings page', () => {
	it('renders a safe fallback when logs settings are unavailable', () => {
		render(Page, { props: { data: {} as never, form: null, params: { orgId: 'test-org' } } });

		expect(screen.getByText('Organization logs are not available.')).toBeTruthy();
	});

	it("groups entries under day heads in the viewer's time zone", async () => {
		const { table } = await renderLogs({ rows: MIXED });

		expect(days(table)).toEqual([
			{ title: 'Today', count: '2', entries: ['2026-10-20T03:30:00.000Z', '2026-10-19T17:05:00.000Z'] },
			{ title: 'Yesterday', count: '1', entries: ['2026-10-18T22:00:00.000Z'] },
			{ title: '15 Oct', count: '1', entries: ['2026-10-15T12:00:00.000Z'] }
		]);
		expect(statusText()).toContain('4 entries loaded · end of the log');
		expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
	});

	it('names System only for an entry with no actor, and an unnamed member as Unknown member', async () => {
		const { table } = await renderLogs({
			rows: [
				{ action: 'personnel.updated', createdAt: '2026-10-19T12:00:00Z', userId: null, actor: null },
				{ action: 'personnel.updated', createdAt: '2026-10-19T11:00:00Z', userId: 'removed-member', actor: null }
			]
		});

		expect(actors(table)).toEqual(['System', 'Unknown member']);
	});

	it('collapses the entries one action wrote into one line that opens to each entry', async () => {
		const saved = (action: string, person: string, at: string): Row => ({
			action,
			createdAt: at,
			batchId: 'import-1',
			recordLabel: 'Leave',
			subject: { personnelId: null, label: person },
			details: { startDate: '2026-11-10', endDate: '2026-11-20' }
		});
		const { table } = await renderLogs({
			rows: [
				saved('availability.created', 'SPC Doe, Jane', '2026-10-19T12:00:01Z'),
				saved('availability.created', 'PFC Roe, Rich', '2026-10-19T12:00:01Z'),
				saved('availability.deleted', 'SPC Doe, Jane', '2026-10-19T12:00:01Z'),
				{ action: 'personnel.updated', createdAt: '2026-10-19T11:00:00Z', details: { subject_label: 'SPC Reed' } }
			]
		});
		const line = table.getByRole('button', { name: 'Added 2 availability entries, deleted 1 availability entry' });
		const removed = 'Deleted Leave for SPC Doe, Jane from 10 Nov to 20 Nov';

		expect(line.getAttribute('aria-expanded')).toBe('false');
		expect(table.queryByRole('cell', { name: removed })).toBeNull();

		await fireEvent.click(line);

		expect(line.getAttribute('aria-expanded')).toBe('true');
		expect(table.getByRole('cell', { name: removed })).toBeTruthy();
	});

	describe('loading more', () => {
		function stubFetch(...responses: (AuditLogQueryResult | Error)[]) {
			const fetchMock = vi.fn(async (_url: string) => {
				const next = responses.shift();
				if (!next || next instanceof Error) return new Response('{}', { status: 500 });
				return Response.json(next);
			});
			vi.stubGlobal('fetch', fetchMock);
			return fetchMock;
		}

		it('reads the next page with the filters and cursor, appends it, and ends when no cursor comes back', async () => {
			const fetchMock = stubFetch({
				logs: entriesOf([{ action: 'personnel.updated', createdAt: '2026-10-10T12:00:00Z' }], 'next'),
				nextCursor: null
			});
			const { table } = await renderLogs({ rows: MIXED, nextCursor: CURSOR, filters: { userId: MEMBER } });

			expect(statusText()).toContain('4 entries loaded · more available');
			expect(days(table).at(-1)).toMatchObject({ title: '15 Oct', count: '1+' });

			await fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

			await waitFor(() => expect(statusText()).toContain('5 entries loaded · end of the log'));
			const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'https://app.test');
			expect(url.pathname).toBe('/org/test-org/api/audit-log');
			expect(url.searchParams.get('member')).toBe(MEMBER);
			expect(url.searchParams.get('after')).toBe(CURSOR);
			expect(days(table).map((day) => [day.title, day.count])).toEqual([
				['Today', '2'],
				['Yesterday', '1'],
				['15 Oct', '1'],
				['10 Oct', '1']
			]);
			expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
		});

		it('joins an action that spans two pages into one line once both are loaded', async () => {
			const written = (person: string): Row => ({
				action: 'availability.created',
				createdAt: '2026-10-19T12:00:01Z',
				batchId: 'import-1',
				recordLabel: 'Leave',
				subject: { personnelId: null, label: person },
				details: { startDate: '2026-11-10', endDate: '2026-11-20' }
			});
			stubFetch({ logs: entriesOf([written('PFC Roe, Rich')], 'next'), nextCursor: null });
			const { table } = await renderLogs({
				rows: [written('SPC Doe, Jane'), written('SGT Poe, Ed')],
				nextCursor: CURSOR
			});

			expect(table.getByRole('button', { name: 'Added at least 2 availability entries' })).toBeTruthy();

			await fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

			expect(await table.findByRole('button', { name: 'Added 3 availability entries' })).toBeTruthy();
		});

		it('keeps the entries it has and offers Retry when the next page fails', async () => {
			stubFetch(new Error('down'), {
				logs: entriesOf([{ action: 'personnel.updated', createdAt: '2026-10-10T12:00:00Z' }], 'next'),
				nextCursor: null
			});
			const { table } = await renderLogs({ rows: MIXED, nextCursor: CURSOR });

			await fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
			const alert = await screen.findByRole('alert');

			expect(alert.textContent).toContain('The next entries could not be loaded.');
			expect(days(table)).toHaveLength(3);

			await fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

			await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
			expect(days(table)).toHaveLength(4);
		});

		it('drops a page that arrives after the filters changed', async () => {
			let release!: (response: Response) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
			);
			const { rerender } = await renderLogs({ rows: MIXED, nextCursor: CURSOR });

			await fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
			await rerender({
				data: pageData({
					rows: [{ action: 'org.renamed', createdAt: '2026-10-19T09:00:00Z', details: { name: 'Bravo Co' } }],
					filters: { kind: 'org.renamed' }
				}),
				form: null,
				params: { orgId: 'test-org' }
			});
			release(
				Response.json({
					logs: entriesOf([{ action: 'personnel.updated', createdAt: '2026-10-10T12:00:00Z' }], 'next'),
					nextCursor: null
				})
			);

			await waitFor(() => expect(statusText()).toContain('1 entry loaded'));
			expect(screen.queryByRole('alert')).toBeNull();
		});
	});

	describe('filters', () => {
		it('puts the chosen kind in the URL and keeps the other filters', async () => {
			await renderLogs({ rows: MIXED, filters: { userId: MEMBER } });

			await fireEvent.click(await screen.findByRole('button', { name: 'Kind' }));
			await fireEvent.click(
				within(await screen.findByRole('listbox')).getByRole('option', { name: 'Availability deleted' })
			);

			await waitFor(() =>
				expect(goto).toHaveBeenCalledWith(`/org/test-org/settings/logs?member=${MEMBER}&kind=availability.deleted`, {
					reset: false
				})
			);
		});

		it('offers each person on the roster, archived ones marked', async () => {
			await renderLogs({ rows: MIXED });

			await fireEvent.click(await screen.findByRole('button', { name: 'Person' }));
			const listbox = await screen.findByRole('listbox');

			expect(within(listbox).getByRole('option', { name: /SGT Rivera, Sam/ })).toBeTruthy();
			expect(within(listbox).getByRole('option', { name: /SPC Able, Jane.*Archived/ })).toBeTruthy();
		});

		it('shows a person from the link even when the roster no longer lists them', async () => {
			await renderLogs({ rows: MIXED, filters: { personId: '55555555-5555-4555-8555-555555555555' } });

			expect((await screen.findByRole('button', { name: 'Person' })).textContent).toContain(
				'Person no longer on the roster'
			);
		});

		it('clears one date without touching the other', async () => {
			await renderLogs({ rows: MIXED, filters: { from: '2026-10-01', to: '2026-10-10' } });

			await fireEvent.click(screen.getByRole('button', { name: 'Clear to date' }));

			expect(goto).toHaveBeenCalledWith('/org/test-org/settings/logs?from=2026-10-01', { reset: false });
		});

		it('builds a second change on the first while the first navigation is still running', async () => {
			goto.mockImplementationOnce(() => new Promise(() => {}));
			await renderLogs({ rows: MIXED, filters: { from: '2026-10-01', to: '2026-10-10' } });

			await fireEvent.click(screen.getByRole('button', { name: 'Clear to date' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Clear from date' }));

			expect(goto).toHaveBeenLastCalledWith('/org/test-org/settings/logs', { reset: false });
		});

		it('clears every filter at once', async () => {
			await renderLogs({ rows: MIXED, filters: { userId: MEMBER, kind: 'org.renamed', from: '2026-10-01' } });

			await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

			expect(goto).toHaveBeenCalledWith('/org/test-org/settings/logs', { reset: false });
		});

		it('says legacy entries match without a person only when a person is chosen', async () => {
			const { unmount } = await renderLogs({ rows: MIXED });
			expect(screen.queryByText(/match by member, kind and date only/)).toBeNull();
			unmount();

			await renderLogs({ rows: MIXED, filters: { personId: PERSON } });
			expect(screen.getByText(/match by member, kind and date only/)).toBeTruthy();
		});

		it('keeps the date filters usable and offers Retry when the pickers cannot be loaded', async () => {
			await renderLogs({ rows: MIXED, options: Promise.reject(new Error('roster down')) });

			const alert = await screen.findByRole('alert');
			expect(alert.textContent).toContain('could not be loaded');
			expect(screen.getByRole('button', { name: 'From' })).toBeTruthy();

			await fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
			expect(invalidateAll).toHaveBeenCalledOnce();
		});
	});

	describe('states', () => {
		it('says when the unit has no entries yet', async () => {
			render(Page, { props: { data: pageData({}), form: null, params: { orgId: 'test-org' } } });

			expect(await screen.findByText('No audit log entries yet.')).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
		});

		it('says when nothing matches the filters, apart from an empty log, and offers to clear them', async () => {
			render(Page, {
				props: { data: pageData({ filters: { kind: 'org.renamed' } }), form: null, params: { orgId: 'test-org' } }
			});

			expect(await screen.findByText('No entries match these filters.')).toBeTruthy();
			expect(screen.queryByText('No audit log entries yet.')).toBeNull();

			await fireEvent.click(
				within(screen.getByRole('region', { name: 'Audit log' })).getByRole('button', { name: 'Clear filters' })
			);
			expect(goto).toHaveBeenCalledWith('/org/test-org/settings/logs', { reset: false });
		});

		it('holds a skeleton for the results only while the log loads, then shows its own load error', async () => {
			let fail!: (reason: Error) => void;
			const auditLog = new Promise<AuditLogQueryResult>((_, reject) => (fail = reject));
			render(Page, { props: { data: pageData({ auditLog }), form: null, params: { orgId: 'test-org' } } });

			expect(statusText()).toBe('Loading the audit log');
			expect(document.querySelector('[data-settings-skeleton="logs"]')).not.toBeNull();
			expect(screen.getByRole('group', { name: 'Filter the audit log' })).toBeTruthy();
			expect(screen.queryByRole('table')).toBeNull();

			fail(new Error('Audit log unavailable'));

			expect(await screen.findByRole('button', { name: 'Retry Audit log' })).toBeTruthy();
			expect(document.querySelector('[data-settings-skeleton]')).toBeNull();
			expect(screen.getByRole('group', { name: 'Filter the audit log' })).toBeTruthy();
		});
	});
});
