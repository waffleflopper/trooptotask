import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createSupabaseDataExportLifecycleWriter,
	type DataExportLifecycleWriter
} from './dataExportPersistence.server';

type Row = Record<string, unknown>;

function provider(initialRows: Row[] = []) {
	const rows = structuredClone(initialRows);
	const state = {
		reject: null as 'POST' | 'PATCH' | null,
		acknowledgment: null as { data: unknown } | null,
		requests: 0
	};
	const client = createClient('http://lifecycle.invalid', 'ordinary-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (
					++state.requests > 8 ||
					url.origin !== 'http://lifecycle.invalid' ||
					url.pathname !== '/rest/v1/data_exports' ||
					!['POST', 'PATCH'].includes(request.method)
				)
					throw new Error('Unexpected lifecycle provider operation');
				if (
					request.headers.get('authorization') !== 'Bearer ordinary-request-key' ||
					request.headers.get('apikey') !== 'ordinary-request-key'
				)
					throw new Error('Lifecycle write must retain ordinary request authority');
				if (state.reject === request.method)
					return Response.json({ code: '42501', message: 'Lifecycle write denied' }, { status: 403 });
				const body: Row = await request.json();
				let affected: Row[];
				if (request.method === 'POST') {
					const row = {
						id: `export-${rows.length + 1}`,
						completed_at: null,
						file_size_bytes: null,
						...body
					};
					rows.push(row);
					affected = [row];
				} else {
					affected = rows.filter((row) => {
						for (const [column, filter] of url.searchParams) {
							if (column === 'select') continue;
							if (!filter.startsWith('eq.')) throw new Error('Unexpected lifecycle predicate');
							if (String(row[column]) !== filter.slice(3)) return false;
						}
						return true;
					});
					for (const row of affected) Object.assign(row, body);
				}
				if (!request.headers.get('prefer')?.split(',').includes('return=representation'))
					return new Response(null, { status: 204 });
				const fields = url.searchParams.get('select');
				const projected = affected.map((row) =>
					fields && fields !== '*' ? Object.fromEntries(fields.split(',').map((column) => [column, row[column]])) : row
				);
				if (request.headers.get('accept') !== 'application/vnd.pgrst.object+json') return Response.json(projected);
				if (projected.length !== 1)
					return Response.json(
						{ code: 'PGRST116', message: 'Expected one saved export', details: `${projected.length} rows` },
						{ status: 406 }
					);
				return Response.json(state.acknowledgment ? state.acknowledgment.data : projected[0]);
			}
		}
	});
	return { client, rows, state };
}

const initialRows: Row[] = [
	{
		id: 'owned-export',
		org_id: 'org-a',
		requested_by: 'admin-a',
		status: 'processing',
		created_at: '2026-10-05T10:00:00.123456Z',
		completed_at: null,
		file_size_bytes: null
	},
	{
		id: 'foreign-export',
		org_id: 'org-b',
		requested_by: 'admin-b',
		status: 'completed',
		created_at: '2026-10-04T09:00:00Z',
		completed_at: '2026-10-04T09:00:01Z',
		file_size_bytes: 2048
	}
];

const terminalWrites = [
	{
		name: 'completion',
		write: (writer: DataExportLifecycleWriter, exportId: string) =>
			writer.markCompleted({ exportId, completedAt: '2026-10-05T10:00:01.654321Z', fileSizeBytes: 3072 })
	},
	{
		name: 'failure',
		write: (writer: DataExportLifecycleWriter, exportId: string) =>
			writer.markFailed({ exportId, completedAt: '2026-10-05T10:00:02.987654Z' })
	}
];

describe('DataExport lifecycle persistence with ordinary request authority', () => {
	it('creates separate processing histories and saves completion or failure for the bound Organization', async () => {
		const { client, rows } = provider();
		const writerA = createSupabaseDataExportLifecycleWriter(client, 'org-a');
		const writerB = createSupabaseDataExportLifecycleWriter(client, 'org-b');
		await expect(
			writerA.createProcessing({ requestedBy: 'admin-a', createdAt: '2026-10-05T10:00:00.123456Z' })
		).resolves.toEqual({ exportId: 'export-1' });
		await expect(
			writerB.createProcessing({ requestedBy: 'admin-b', createdAt: '2026-10-05T11:00:00.654321Z' })
		).resolves.toEqual({ exportId: 'export-2' });
		await writerA.markCompleted({
			exportId: 'export-1',
			completedAt: '2026-10-05T10:00:01.654321Z',
			fileSizeBytes: 3072
		});
		await writerB.markFailed({ exportId: 'export-2', completedAt: '2026-10-05T11:00:01.123456Z' });
		expect(rows).toEqual([
			{
				id: 'export-1',
				org_id: 'org-a',
				requested_by: 'admin-a',
				status: 'completed',
				created_at: '2026-10-05T10:00:00.123456Z',
				completed_at: '2026-10-05T10:00:01.654321Z',
				file_size_bytes: 3072
			},
			{
				id: 'export-2',
				org_id: 'org-b',
				requested_by: 'admin-b',
				status: 'failed',
				created_at: '2026-10-05T11:00:00.654321Z',
				completed_at: '2026-10-05T11:00:01.123456Z',
				file_size_bytes: null
			}
		]);
	});

	it('starts processing without introducing a completion timestamp or file size', async () => {
		const { client, rows } = provider();
		await createSupabaseDataExportLifecycleWriter(client, 'org-a').createProcessing({
			requestedBy: 'admin-a',
			createdAt: '2026-10-05T10:00:00.123456Z'
		});
		expect(rows).toEqual([
			{
				id: 'export-1',
				org_id: 'org-a',
				requested_by: 'admin-a',
				status: 'processing',
				created_at: '2026-10-05T10:00:00.123456Z',
				completed_at: null,
				file_size_bytes: null
			}
		]);
	});

	it('can mark a completed export failed while retaining its saved file size and neighboring history', async () => {
		const { client, rows } = provider(initialRows);
		const writer = createSupabaseDataExportLifecycleWriter(client, 'org-a');
		await writer.markCompleted({
			exportId: 'owned-export',
			completedAt: '2026-10-05T10:00:01.654321Z',
			fileSizeBytes: 3072
		});
		await writer.markFailed({ exportId: 'owned-export', completedAt: '2026-10-05T10:00:02.987654Z' });
		expect(rows).toEqual([
			{
				id: 'owned-export',
				org_id: 'org-a',
				requested_by: 'admin-a',
				status: 'failed',
				created_at: '2026-10-05T10:00:00.123456Z',
				completed_at: '2026-10-05T10:00:02.987654Z',
				file_size_bytes: 3072
			},
			{
				id: 'foreign-export',
				org_id: 'org-b',
				requested_by: 'admin-b',
				status: 'completed',
				created_at: '2026-10-04T09:00:00Z',
				completed_at: '2026-10-04T09:00:01Z',
				file_size_bytes: 2048
			}
		]);
	});

	it.each(terminalWrites)(
		'rejects $name of a foreign or missing export without changing history',
		async ({ write }) => {
			const { client, rows } = provider(initialRows);
			const writer = createSupabaseDataExportLifecycleWriter(client, 'org-a');
			for (const exportId of ['foreign-export', 'missing-export']) {
				await expect(write(writer, exportId)).rejects.toThrow('Expected one saved export');
				expect(rows).toEqual(initialRows);
			}
		}
	);

	it('propagates an insert rejection without recording processing history', async () => {
		const { client, rows, state } = provider();
		state.reject = 'POST';
		await expect(
			createSupabaseDataExportLifecycleWriter(client, 'org-a').createProcessing({
				requestedBy: 'admin-a',
				createdAt: '2026-10-05T10:00:00.123456Z'
			})
		).rejects.toThrow('Lifecycle write denied');
		expect(rows).toEqual([]);
	});

	it.each(terminalWrites)('propagates a $name rejection without changing saved history', async ({ write }) => {
		const { client, rows, state } = provider(initialRows);
		state.reject = 'PATCH';
		await expect(write(createSupabaseDataExportLifecycleWriter(client, 'org-a'), 'owned-export')).rejects.toThrow(
			'Lifecycle write denied'
		);
		expect(rows).toEqual(initialRows);
	});

	it.each([
		{ name: 'null', data: null },
		{ name: 'missing identity', data: {} },
		{ name: 'null identity', data: { id: null } },
		{ name: 'numeric identity', data: { id: 42 } },
		{ name: 'empty identity', data: { id: '' } },
		{ name: 'array', data: [{ id: 'owned-export' }] }
	])('rejects a $name acknowledgment for all writes', async ({ data }) => {
		const { client, state } = provider(initialRows);
		state.acknowledgment = { data };
		const writer = createSupabaseDataExportLifecycleWriter(client, 'org-a');
		await expect(
			writer.createProcessing({ requestedBy: 'admin-a', createdAt: '2026-10-05T12:00:00Z' })
		).rejects.toThrow('invalid acknowledgment');
		for (const { write } of terminalWrites)
			await expect(write(writer, 'owned-export')).rejects.toThrow('invalid acknowledgment');
	});

	it.each(terminalWrites)('rejects a $name acknowledgment for a different export', async ({ write }) => {
		const { client, state } = provider(initialRows);
		state.acknowledgment = { data: { id: 'foreign-export' } };
		await expect(write(createSupabaseDataExportLifecycleWriter(client, 'org-a'), 'owned-export')).rejects.toThrow(
			'invalid acknowledgment'
		);
	});
});
