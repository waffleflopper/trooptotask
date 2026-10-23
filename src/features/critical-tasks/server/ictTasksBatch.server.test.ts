import { describe, expect, it, vi } from 'vitest';
import { createWritePortsContext } from './criticalTasksPersistence.test-support.server';
import { writeUnconfirmed } from './criticalTaskWriteOutcome.server';
import { importIctTasksBatch } from './ictTasksBatch.server';
import { ictTaskImportRecordSchema, ictTaskImportReplySchema } from '../contracts';

function savedTask(id: string, taskCode: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		organization_id: 'test-org',
		task_code: taskCode,
		title: `Title ${taskCode}`,
		description: 'Saved description',
		category: 'Saved category',
		mos: ['68W'],
		expiration_months: 12,
		sort_order: 5,
		archived_at: null,
		created_at: '2026-04-01T00:00:00Z',
		...overrides
	};
}

function contextWith(tasks: ReturnType<typeof savedTask>[]) {
	const ctx = createWritePortsContext();
	ctx.store.seed('ict_tasks', tasks);
	return ctx;
}

async function storedTasks(ctx: ReturnType<typeof contextWith>) {
	const rows = await ctx.store.findMany<Record<string, unknown>>('ict_tasks', 'test-org');
	return Object.fromEntries(
		rows.map((row) => [
			row.task_code,
			{
				title: row.title,
				description: row.description,
				mos: row.mos,
				sortOrder: row.sort_order,
				archived: row.archived_at !== null
			}
		])
	);
}

describe('importIctTasksBatch', () => {
	it.each([{ description: '' }, { category: '' }, { mos: [] }, { description: '   ', category: '   ', mos: [] }])(
		'preserves saved fields when an import update contains blank values %j',
		async (blanks) => {
			const ctx = contextWith([savedTask('task-a', 'ICT-1')]);
			const record = ictTaskImportRecordSchema.parse({ taskCode: 'ICT-1', title: 'Renamed', sortOrder: 0, ...blanks });

			const reply = await importIctTasksBatch(ctx, { records: [record] });

			expect(reply.results.map((result) => result.kind)).toEqual(['updated']);
			expect(await ctx.store.findMany('ict_tasks', 'test-org')).toEqual([
				expect.objectContaining({
					id: 'task-a',
					title: 'Renamed',
					description: 'Saved description',
					category: 'Saved category',
					mos: ['68W'],
					sort_order: 0
				})
			]);
		}
	);

	it('adds new codes, updates matched codes with only the fields sent, and restores archived codes', async () => {
		const ctx = contextWith([
			savedTask('task-a', 'ICT-1'),
			savedTask('task-b', 'ICT-2', { archived_at: '2026-05-01T00:00:00Z', sort_order: 9 })
		]);

		const reply = await importIctTasksBatch(ctx, {
			records: [
				{ taskCode: 'ict-1', title: 'Renamed' },
				{ taskCode: 'ICT-2' },
				{ taskCode: 'ICT-3', title: 'Brand new', mos: ['18D'] }
			]
		});

		expect(reply.results.map((result) => result.kind)).toEqual(['updated', 'updated', 'added']);
		expect(await storedTasks(ctx)).toEqual({
			'ICT-1': { title: 'Renamed', description: 'Saved description', mos: ['68W'], sortOrder: 5, archived: false },
			'ICT-2': { title: 'Title ICT-2', description: 'Saved description', mos: ['68W'], sortOrder: 9, archived: false },
			'ICT-3': { title: 'Brand new', description: null, mos: ['18D'], sortOrder: 10, archived: false }
		});
		expect(ctx.audit.events).toEqual([
			expect.objectContaining({ action: 'ict_task.bulk_imported', details: { inserted: 1, updated: 2, failed: 0 } })
		]);
	});

	it('fails a repeated code and a new code without a title while saving the rest', async () => {
		const ctx = contextWith([]);

		const reply = await importIctTasksBatch(ctx, {
			records: [{ taskCode: 'ICT-1', title: 'First' }, { taskCode: ' ict-1 ', title: 'Second' }, { taskCode: 'ICT-2' }]
		});

		expect(reply.results).toEqual([
			expect.objectContaining({ kind: 'added' }),
			{ kind: 'failed', message: 'Task code ICT-1 appears more than once in this import.' },
			{ kind: 'failed', message: 'A new task needs a title.' }
		]);
		expect(Object.keys(await storedTasks(ctx))).toEqual(['ICT-1']);
	});

	it('reports an unconfirmed create without retrying the write', async () => {
		const ctx = contextWith([]);
		const createMany = ctx.criticalTaskLibrary.createMany.bind(ctx.criticalTaskLibrary);
		vi.spyOn(ctx.criticalTaskLibrary, 'createMany').mockImplementation(async (records) => {
			await createMany(records);
			writeUnconfirmed();
		});

		const reply = await importIctTasksBatch(ctx, { records: [{ taskCode: 'ICT-1', title: 'First' }] });

		expect(ictTaskImportReplySchema.parse(reply).results).toEqual([
			{ kind: 'unconfirmed', message: expect.any(String) }
		]);
		expect(await ctx.store.findMany('ict_tasks', 'test-org')).toEqual([
			expect.objectContaining({ task_code: 'ICT-1', title: 'First', sort_order: 0, archived_at: null })
		]);
		expect(ctx.audit.events).toEqual([expect.objectContaining({ details: { inserted: 0, updated: 0, failed: 0 } })]);
	});

	it.each(['fallback create', 'update'])(
		'retains confirmed rows and known failures after an unconfirmed %s',
		async (operation) => {
			const ctx = contextWith([savedTask('task-a', 'ICT-1'), savedTask('task-b', 'ICT-2')]);
			if (operation === 'fallback create') {
				vi.spyOn(ctx.criticalTaskLibrary, 'createMany').mockRejectedValueOnce(new Error('Bulk insert refused'));
				const create = ctx.criticalTaskLibrary.create.bind(ctx.criticalTaskLibrary);
				vi.spyOn(ctx.criticalTaskLibrary, 'create').mockImplementation(async (record) => {
					await create(record);
					writeUnconfirmed();
				});
			} else {
				const update = ctx.criticalTaskLibrary.update.bind(ctx.criticalTaskLibrary);
				vi.spyOn(ctx.criticalTaskLibrary, 'update').mockImplementation(async (id, patch) => {
					const saved = await update(id, patch);
					if (id === 'task-b') writeUnconfirmed();
					return saved;
				});
			}

			const reply = await importIctTasksBatch(ctx, {
				records: [
					{ taskCode: 'ICT-1', title: 'Confirmed title' },
					{ taskCode: operation === 'update' ? 'ICT-2' : 'ICT-3', title: 'Unconfirmed title' },
					{ taskCode: 'ICT-4' }
				]
			});

			expect(ictTaskImportReplySchema.parse(reply).results).toEqual([
				{ kind: 'updated', record: expect.objectContaining({ id: 'task-a', title: 'Confirmed title' }) },
				{ kind: 'unconfirmed', message: expect.any(String) },
				{ kind: 'failed', message: 'A new task needs a title.' }
			]);
			expect((await storedTasks(ctx))['ICT-1'].title).toBe('Confirmed title');
			expect(ctx.audit.events).toEqual([expect.objectContaining({ details: { inserted: 0, updated: 1, failed: 1 } })]);
		}
	);

	it('rejects a batch above 500 rows before writing task records', async () => {
		const ctx = contextWith([]);

		await expect(
			importIctTasksBatch(ctx, {
				records: Array.from({ length: 501 }, (_, index) => ({ taskCode: `ICT-${index}`, title: 'Task' }))
			})
		).rejects.toMatchObject({ status: 400 });
		expect(await storedTasks(ctx)).toEqual({});
	});
});
