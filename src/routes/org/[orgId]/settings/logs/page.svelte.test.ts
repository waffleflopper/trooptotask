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

function rowTexts(table: ReturnType<typeof within>): string[] {
	return table
		.getAllByRole('row')
		.slice(1)
		.map((row: HTMLElement) => row.textContent?.replace(/\s+/g, ' ').trim() ?? '');
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
		actor: null
	}
];

describe('logs settings page', () => {
	it('renders a safe fallback when logs settings are unavailable', () => {
		render(Page, { props: { data: {} as never, form: null, params: { orgId: 'org-1' } } });

		expect(screen.getByText('Organization logs are not available.')).toBeTruthy();
	});

	it("groups entries under day heads in the viewer's time zone, with the clock only on each row and a floor on the cut-off day", () => {
		const table = renderLogs(MIXED, { recentCount: 96, totalCount: 1284 });

		expect(rowTexts(table)).toEqual([
			'Today 19 Oct · 2 entries',
			'23:30 Policies Turned off Training dana@army.mil',
			'13:05 Approvals Approved deletion of Weapons Qualification dana@army.mil',
			'Yesterday 18 Oct · 1 entry',
			'18:00 Members Invited b***@army.mil dana@army.mil',
			'15 Oct 1+ entries',
			'08:00 Personnel Updated SPC Reed System'
		]);
		expect(screen.getByText('96 this month · 1,284 total')).toBeTruthy();
	});

	it('narrows rows to a quick scope and combines it with search', async () => {
		const table = renderLogs(MIXED);

		await fireEvent.click(screen.getByRole('radio', { name: 'Access' }));
		expect(rowTexts(table)).toEqual([
			'Today 19 Oct · 1 entry',
			'23:30 Policies Turned off Training dana@army.mil',
			'Yesterday 18 Oct · 1 entry',
			'18:00 Members Invited b***@army.mil dana@army.mil'
		]);

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search audit log' }), {
			target: { value: 'invited' }
		});
		expect(rowTexts(table)).toEqual([
			'Yesterday 18 Oct · 1 entry',
			'18:00 Members Invited b***@army.mil dana@army.mil'
		]);

		await fireEvent.click(screen.getByRole('radio', { name: 'Deletions' }));
		expect(screen.getByText('No audit log entries match "invited" in Deletions.')).toBeTruthy();

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search audit log' }), { target: { value: '' } });
		expect(rowTexts(table)).toEqual([
			'Today 19 Oct · 1 entry',
			'13:05 Approvals Approved deletion of Weapons Qualification dana@army.mil'
		]);
	});

	it('drops the day heads when sorted by anything but time', async () => {
		const table = renderLogs(MIXED);

		await fireEvent.click(screen.getByRole('button', { name: 'Sort by Area' }));
		expect(rowTexts(table)).toEqual([
			'13:05 Approvals Approved deletion of Weapons Qualification dana@army.mil',
			'18:00 Members Invited b***@army.mil dana@army.mil',
			'08:00 Personnel Updated SPC Reed System',
			'23:30 Policies Turned off Training dana@army.mil'
		]);

		await fireEvent.click(screen.getByRole('button', { name: 'Sort by Time' }));
		expect(rowTexts(table)[0]).toBe('15 Oct 1 entry');
	});

	it('pages 25 rows at a time with Newer and Older', async () => {
		const rows = Array.from({ length: 30 }, (_, index) => ({
			action: 'status_type.created',
			createdAt: new Date(Date.UTC(2026, 9, 19, 23, 0) - index * 60_000).toISOString()
		}));
		const table = renderLogs(rows);

		expect(screen.getByText('1–25 of 30')).toBeTruthy();
		expect(rowTexts(table)[0]).toBe('Today 19 Oct · 30 entries');

		await fireEvent.click(screen.getByRole('button', { name: 'Older' }));
		expect(screen.getByText('26–30 of 30')).toBeTruthy();
		expect(rowTexts(table)).toEqual([
			'Today 19 Oct · 30 entries',
			'18:35 Calendar Added a status type dana@army.mil',
			'18:34 Calendar Added a status type dana@army.mil',
			'18:33 Calendar Added a status type dana@army.mil',
			'18:32 Calendar Added a status type dana@army.mil',
			'18:31 Calendar Added a status type dana@army.mil'
		]);
		expect((screen.getByRole('button', { name: 'Older' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('says when the unit has no entries yet', () => {
		renderLogs([]);

		expect(screen.getByText('No audit log entries yet.')).toBeTruthy();
	});
});
