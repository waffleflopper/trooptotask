// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditLogEntry } from '$lib/audit/contracts';
import Page from './+page.svelte';

afterEach(cleanup);

type Row = Pick<AuditLogEntry, 'action' | 'createdAt'> & Partial<AuditLogEntry>;

function renderLogs(rows: Row[], counts = { recentCount: rows.length, totalCount: rows.length }) {
	const logs = rows.map((row, index) => ({
		id: `audit-${index}`,
		userId: 'user-1',
		actor: 'dana@army.mil',
		resourceType: null,
		resourceId: null,
		details: null,
		...row
	}));
	render(Page, {
		props: {
			data: {
				logsSettings: {
					timeZone: 'America/New_York',
					today: '2026-10-19',
					auditLog: { logs, ...counts, page: 1, limit: 100, actionFilter: '', availableActions: [] }
				}
			} as never,
			form: null,
			params: { orgId: 'org-1' }
		}
	});
	return within(screen.getByRole('table', { name: 'Organization audit log entries' }));
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

/** The rows on the page in order, as instant, area and actor. */
function entries(table: ReturnType<typeof within>): [string, string, string][] {
	return table
		.getAllByRole('row')
		.filter((row: HTMLElement) => row.querySelector('time'))
		.map((row: HTMLElement) => {
			const cells = Array.from(row.querySelectorAll('td'), (cell) => cell.textContent?.trim() ?? '');
			return [row.querySelector('time')?.getAttribute('datetime') ?? '', cells[1], cells[3]];
		});
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
		render(Page, { props: { data: {} as never, form: null, params: { orgId: 'org-1' } } });

		expect(screen.getByText('Organization logs are not available.')).toBeTruthy();
	});

	it("groups entries under day heads in the viewer's time zone, with a floor on the cut-off day", () => {
		const table = renderLogs(MIXED, { recentCount: 96, totalCount: 1284 });

		expect(days(table)).toEqual([
			{ title: 'Today', count: '2', entries: ['2026-10-20T03:30:00.000Z', '2026-10-19T17:05:00.000Z'] },
			{ title: 'Yesterday', count: '1', entries: ['2026-10-18T22:00:00.000Z'] },
			{ title: '15 Oct', count: '1+', entries: ['2026-10-15T12:00:00.000Z'] }
		]);
		expect(entries(table).map(([at, , actor]) => [at, actor])).toEqual([
			['2026-10-20T03:30:00.000Z', 'dana@army.mil'],
			['2026-10-19T17:05:00.000Z', 'dana@army.mil'],
			['2026-10-18T22:00:00.000Z', 'dana@army.mil'],
			['2026-10-15T12:00:00.000Z', 'System']
		]);
		expect(screen.getByText('96 this month · 1,284 total')).toBeTruthy();
	});

	it('names System only for an entry with no actor, and an unnamed member as Unknown member', () => {
		const table = renderLogs([
			{ action: 'personnel.updated', createdAt: '2026-10-19T12:00:00Z', userId: null, actor: null },
			{ action: 'personnel.updated', createdAt: '2026-10-19T11:00:00Z', userId: 'removed-member', actor: null }
		]);

		expect(entries(table).map(([, , actor]) => actor)).toEqual(['System', 'Unknown member']);
	});

	it('marks the cut-off day as a floor only in the unfiltered list', async () => {
		const table = renderLogs(MIXED, { recentCount: 96, totalCount: 1284 });

		await fireEvent.click(screen.getByRole('radio', { name: 'Records' }));
		expect(days(table)).toEqual([{ title: '15 Oct', count: '1', entries: ['2026-10-15T12:00:00.000Z'] }]);

		await fireEvent.click(screen.getByRole('radio', { name: 'All' }));
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search audit log' }), {
			target: { value: 'SPC Reed' }
		});
		expect(days(table)).toEqual([{ title: '15 Oct', count: '1', entries: ['2026-10-15T12:00:00.000Z'] }]);
	});

	it('says the pages cover only the latest entries when the log holds more', async () => {
		const rows = Array.from({ length: 30 }, (_, index) => ({
			action: index < 28 ? 'status_type.created' : 'member.invite',
			createdAt: new Date(Date.UTC(2026, 9, 19, 23, 0) - index * 60_000).toISOString()
		}));
		renderLogs(rows, { recentCount: 30, totalCount: 110 });

		expect(screen.getByText('1–25 of the latest 30')).toBeTruthy();

		await fireEvent.click(screen.getByRole('radio', { name: 'Records' }));
		expect(screen.getByText('1–25 of 28 in the latest 30')).toBeTruthy();
	});

	it('narrows rows to a quick scope and combines it with search', async () => {
		const table = renderLogs(MIXED);
		const search = screen.getByRole('searchbox', { name: 'Search audit log' });
		const instants = () => entries(table).map(([at]) => at);

		await fireEvent.click(screen.getByRole('radio', { name: 'Access' }));
		expect(screen.getByRole('radio', { name: 'Access' }).getAttribute('aria-checked')).toBe('true');
		expect(instants()).toEqual(['2026-10-20T03:30:00.000Z', '2026-10-18T22:00:00.000Z']);

		await fireEvent.input(search, { target: { value: 'b***@army.mil' } });
		expect(days(table)).toEqual([{ title: 'Yesterday', count: '1', entries: ['2026-10-18T22:00:00.000Z'] }]);

		await fireEvent.click(screen.getByRole('radio', { name: 'Deletions' }));
		expect(table.queryAllByRole('row').filter((row: HTMLElement) => row.querySelector('time'))).toHaveLength(0);
		expect(screen.getByText('No audit log entries match "b***@army.mil" in Deletions.')).toBeTruthy();

		await fireEvent.input(search, { target: { value: '' } });
		expect(instants()).toEqual(['2026-10-19T17:05:00.000Z']);
	});

	it('drops the day heads when sorted by anything but time', async () => {
		const table = renderLogs(MIXED);

		await fireEvent.click(screen.getByRole('button', { name: 'Sort by Area' }));
		expect(days(table)).toEqual([]);
		expect(entries(table).map(([, area]) => area)).toEqual(['Approvals', 'Members', 'Personnel', 'Policies']);

		await fireEvent.click(screen.getByRole('button', { name: 'Sort by Time' }));
		expect(days(table).map((day) => day.title)).toEqual(['15 Oct', 'Yesterday', 'Today']);
		expect(entries(table)[0][0]).toBe('2026-10-15T12:00:00.000Z');
	});

	it('pages 25 rows at a time with Newer and Older', async () => {
		const rows = Array.from({ length: 30 }, (_, index) => ({
			action: 'status_type.created',
			createdAt: new Date(Date.UTC(2026, 9, 19, 23, 0) - index * 60_000).toISOString()
		}));
		const table = renderLogs(rows);
		const newer = screen.getByRole('button', { name: 'Newer' }) as HTMLButtonElement;
		const older = screen.getByRole('button', { name: 'Older' }) as HTMLButtonElement;

		expect(screen.getByText('1–25 of 30')).toBeTruthy();
		expect([newer.disabled, older.disabled]).toEqual([true, false]);
		expect(days(table)).toMatchObject([{ title: 'Today', count: '30' }]);

		await fireEvent.click(older);
		expect(screen.getByText('26–30 of 30')).toBeTruthy();
		expect([newer.disabled, older.disabled]).toEqual([false, true]);
		expect(days(table)).toEqual([
			{
				title: 'Today',
				count: '30',
				entries: [
					'2026-10-19T22:35:00.000Z',
					'2026-10-19T22:34:00.000Z',
					'2026-10-19T22:33:00.000Z',
					'2026-10-19T22:32:00.000Z',
					'2026-10-19T22:31:00.000Z'
				]
			}
		]);
	});

	it('holds a skeleton while the log loads, then shows its own load error when the read fails', async () => {
		let fail!: (reason: Error) => void;
		const auditLog = new Promise((_, reject) => (fail = reject));
		render(Page, {
			props: {
				data: { logsSettings: { timeZone: 'America/New_York', today: '2026-10-19', auditLog } } as never,
				form: null,
				params: { orgId: 'org-1' }
			}
		});

		expect(screen.getByRole('status').textContent).toBe('Loading the audit log');
		expect(document.querySelector('[data-settings-skeleton="logs"]')).not.toBeNull();
		expect(screen.queryByRole('table')).toBeNull();

		fail(new Error('Audit log unavailable'));

		expect(await screen.findByRole('button', { name: 'Retry Audit log' })).toBeTruthy();
		expect(screen.queryByRole('status')).toBeNull();
		expect(document.querySelector('[data-settings-skeleton]')).toBeNull();
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
		const table = renderLogs([
			saved('availability.created', 'SPC Doe, Jane', '2026-10-19T12:00:01Z'),
			saved('availability.created', 'PFC Roe, Rich', '2026-10-19T12:00:01Z'),
			saved('availability.deleted', 'SPC Doe, Jane', '2026-10-19T12:00:01Z'),
			{ action: 'personnel.updated', createdAt: '2026-10-19T11:00:00Z', details: { subject_label: 'SPC Reed' } }
		]);
		const line = table.getByRole('button', { name: 'Added 2 availability entries, deleted 1 availability entry' });
		const removed = 'Deleted Leave for SPC Doe, Jane from 10 Nov to 20 Nov';

		expect(line.getAttribute('aria-expanded')).toBe('false');
		expect(table.queryByRole('cell', { name: removed })).toBeNull();
		expect(days(table)).toEqual([
			{ title: 'Today', count: '4', entries: ['2026-10-19T12:00:01.000Z', '2026-10-19T11:00:00.000Z'] }
		]);

		await fireEvent.click(line);

		expect(line.getAttribute('aria-expanded')).toBe('true');
		for (const id of line.getAttribute('aria-controls')?.split(' ') ?? []) {
			expect(document.getElementById(id)?.hidden).toBe(false);
		}
		expect(table.getByRole('cell', { name: removed })).toBeTruthy();
		expect(table.getByRole('cell', { name: 'Added Leave for PFC Roe, Rich from 10 Nov to 20 Nov' })).toBeTruthy();

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search audit log' }), {
			target: { value: 'Roe' }
		});

		expect(table.getByRole('button', { name: /^Added 2 availability entries/ })).toBeTruthy();
		expect(table.queryByRole('cell', { name: /SPC Reed/ })).toBeNull();
	});

	it('says when the unit has no entries yet', () => {
		renderLogs([]);

		expect(screen.getByText('No audit log entries yet.')).toBeTruthy();
	});
});
