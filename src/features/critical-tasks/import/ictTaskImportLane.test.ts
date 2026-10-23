import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseImportDate } from '$lib/components/patterns/import-flow';
import type { IctTask } from '../criticalTasks.types';
import {
	criticalTasksWorkspaceStatus,
	resetCriticalTasksWorkspaceStatus
} from '../criticalTasksWorkspaceStatus.svelte';
import { ictTasksStore } from '../stores/ictTasks.svelte';
import { createIctTaskImportLane } from './ictTaskImportLane';

function task(id: string, taskCode: string, overrides: Partial<IctTask> = {}): IctTask {
	return {
		id,
		taskCode,
		title: `Title ${taskCode}`,
		description: 'Saved description',
		category: 'Airway',
		mos: ['68W', '18D'],
		expirationMonths: 12,
		sortOrder: 4,
		archivedAt: null,
		createdAt: '2026-04-01T00:00:00Z',
		...overrides
	};
}

const tasks = [task('task-active', 'ICT-1'), task('task-archived', 'ICT-2', { archivedAt: '2026-05-01T00:00:00Z' })];

type Lane = ReturnType<typeof createIctTaskImportLane>;
type Raw = Partial<Record<keyof Lane['columns'], string>>;

function review(raw: Raw) {
	const integer = (value: string | undefined) => (value ? Number(value) : null);
	return createIctTaskImportLane({ orgUrlSegment: 'unit', tasks }).review({
		values: {
			taskCode: raw.taskCode ?? '',
			title: raw.title ?? null,
			description: raw.description ?? null,
			category: raw.category ?? null,
			mos: raw.mos ?? null,
			expirationMonths: integer(raw.expirationMonths),
			sortOrder: integer(raw.sortOrder)
		},
		refs: {},
		ask: () => undefined,
		parseDate: (value) => parseImportDate(value)
	});
}

beforeEach(() => {
	ictTasksStore.load(structuredClone(tasks), 'org-1');
	resetCriticalTasksWorkspaceStatus();
});

afterEach(() => {
	vi.unstubAllGlobals();
	ictTasksStore.load([], 'org-test-reset');
});

describe('critical task library import lane', () => {
	it('keeps confirmed task updates when another row is unconfirmed', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					results: [
						{ kind: 'updated', record: { ...tasks[0], title: 'Confirmed title' } },
						{ kind: 'unconfirmed', message: 'Check the new task before retrying.' },
						{ kind: 'failed', message: 'A new task needs a title.' }
					]
				})
			)
		);

		const reply = await createIctTaskImportLane({ orgUrlSegment: 'unit', tasks }).commitChunk([
			{ taskCode: 'ICT-1', title: 'Confirmed title' },
			{ taskCode: 'ICT-3', title: 'New task' },
			{ taskCode: 'ICT-4' }
		]);

		expect(reply).toEqual({
			kind: 'saved',
			results: [
				{ kind: 'updated' },
				{ kind: 'unconfirmed', reason: 'Check the new task before retrying.' },
				{ kind: 'failed', reason: 'A new task needs a title.' }
			]
		});
		expect(ictTasksStore.items.find((saved) => saved.id === 'task-active')?.title).toBe('Confirmed title');
	});

	it('adds a new code under its normalized form and leaves blank cells out of the record', () => {
		expect(review({ taskCode: ' ict-9 ', title: 'Open an airway', mos: '68w, 18D' })).toEqual({
			outcome: 'new',
			key: 'ICT-9',
			change: { taskCode: 'ICT-9', title: 'Open an airway', mos: ['68W', '18D'] }
		});
	});

	it('asks for a title on a new code and refuses a malformed MOS or a non-positive expiration', () => {
		expect(review({ taskCode: 'ICT-9' })).toMatchObject({
			outcome: 'fix',
			problems: [{ field: 'title' }]
		});
		expect(review({ taskCode: 'ICT-1', mos: '68W, Combat medic' })).toMatchObject({
			outcome: 'fix',
			problems: [{ field: 'mos' }]
		});
		expect(review({ taskCode: 'ICT-1', expirationMonths: '0' })).toMatchObject({
			outcome: 'fix',
			problems: [{ field: 'expirationMonths' }]
		});
	});

	it('shows each changed field of a saved code as an update', () => {
		expect(review({ taskCode: 'ict-1', title: 'Renamed', mos: '68W', expirationMonths: '24' })).toEqual({
			outcome: 'update',
			key: 'ICT-1',
			change: { taskCode: 'ICT-1', title: 'Renamed', mos: ['68W'], expirationMonths: 24 },
			diff: [
				{ label: 'Title', before: 'Title ICT-1', after: 'Renamed' },
				{ label: 'MOS', before: '68W, 18D', after: '68W' },
				{ label: 'Expires after (months)', before: '12', after: '24' }
			]
		});
	});

	it('shows an archived code as a restore even when no other field changes', () => {
		expect(review({ taskCode: 'ICT-2', title: 'Title ICT-2' })).toEqual({
			outcome: 'update',
			key: 'ICT-2',
			change: { taskCode: 'ICT-2', title: 'Title ICT-2' },
			diff: [{ label: 'Status', before: 'Archived', after: 'Active' }]
		});
	});

	it('holds a sort order the server cannot store for a fix before Import', () => {
		expect(review({ taskCode: 'ICT-9', title: 'New', sortOrder: '2147483648' })).toMatchObject({
			outcome: 'fix',
			problems: [{ field: 'sortOrder' }]
		});
	});

	it('shows an exact re-import as unchanged, with MOS order and blank cells ignored', () => {
		expect(
			review({ taskCode: 'ICT-1', title: 'Title ICT-1', category: 'Airway', mos: '18D, 68W', sortOrder: '4' })
		).toEqual({ outcome: 'unchanged', key: 'ICT-1' });
	});

	it('posts the chunk, maps server row errors back to rows and refreshes the workspace after a restore', async () => {
		const fetch = vi.fn(async () =>
			Response.json({
				results: [
					{ kind: 'updated', record: { ...tasks[1], archivedAt: null } },
					{ kind: 'failed', message: 'A new task needs a title.' }
				]
			})
		);
		vi.stubGlobal('fetch', fetch);

		const reply = await createIctTaskImportLane({ orgUrlSegment: 'unit', tasks }).commitChunk([
			{ taskCode: 'ICT-2' },
			{ taskCode: 'ICT-9' }
		]);

		expect(reply).toEqual({
			kind: 'saved',
			results: [{ kind: 'updated' }, { kind: 'failed', reason: 'A new task needs a title.' }]
		});
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect([url, JSON.parse(String(init.body))]).toEqual([
			'/org/org-1/api/ict-tasks/batch',
			{ records: [{ taskCode: 'ICT-2' }, { taskCode: 'ICT-9' }] }
		]);
		expect(ictTasksStore.items.find((saved) => saved.id === 'task-archived')?.archivedAt).toBeNull();
		expect(criticalTasksWorkspaceStatus.refreshRequested).toBe(true);
	});
});
