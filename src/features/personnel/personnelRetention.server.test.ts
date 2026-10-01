import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabasePersonnelRetentionSource } from './personnelRetention.server';

const ORG = 'd1204000-0000-4000-8000-000000000001';
const FOREIGN_ORG = 'd1204000-0000-4000-8000-000000000002';
const CUTOFF = '2025-05-30T12:00:00.000Z';
const EXPIRED = '2025-01-01T00:00:00.000Z';
const RECENT = '2026-04-01T00:00:00.000Z';
const DOCUMENT_BUCKET = 'personnel-documents';
const COUNSELING_BUCKET = 'counseling-files';

type Table = 'personnel' | 'personnel_documents' | 'counseling_records';
interface Row {
	id: string;
	organization_id: string;
	archived_at?: string | null;
	personnel_id?: string;
	file_path?: string | null;
}
interface DeleteInput {
	p_org_id: string;
	p_candidate_ids: string[];
	p_cutoff: string;
}
type ReadStage = 'discovery' | 'manifest' | 'confirmation';

function personId(index: number) {
	return `d1204100-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function inIds(filter: string | null): string[] | null {
	return filter?.startsWith('in.(') ? filter.slice(4, -1).split(',') : null;
}

/** Real SDK and owner operation against a synthetic REST boundary, not SQL/Storage enforcement. */
function fixture() {
	const state = {
		rows: {
			personnel: [
				{ id: personId(1), organization_id: ORG, archived_at: '2025-05-30T11:59:59.999Z' },
				{ id: personId(2), organization_id: ORG, archived_at: EXPIRED },
				{ id: personId(3), organization_id: ORG, archived_at: null },
				{ id: personId(4), organization_id: ORG, archived_at: RECENT },
				{ id: personId(5), organization_id: ORG, archived_at: CUTOFF },
				{ id: personId(6), organization_id: FOREIGN_ORG, archived_at: EXPIRED }
			],
			personnel_documents: [],
			counseling_records: []
		} as Record<Table, Row[]>,
		files: new Map<string, number[]>(),
		rpcInputs: [] as DeleteInput[],
		readFailure: null as null | ((table: Table, stage: ReadStage, ids: string[] | null, offset: number) => boolean),
		rpcFailure: false,
		countOverride: undefined as unknown,
		beforeDelete: () => {}
	};

	function addFile(
		table: 'personnel_documents' | 'counseling_records',
		id: string,
		parent: number,
		archivedAt: string | null
	) {
		const organizationId = parent === 6 ? FOREIGN_ORG : ORG;
		const bucket = table === 'personnel_documents' ? DOCUMENT_BUCKET : COUNSELING_BUCKET;
		const path = `${organizationId}/${id}.pdf`;
		state.rows[table].push({
			id,
			organization_id: organizationId,
			personnel_id: personId(parent),
			archived_at: archivedAt,
			file_path: path
		});
		state.files.set(`${bucket}:${path}`, [1, 2, parent]);
	}

	for (const [table, bucket] of [
		['personnel_documents', DOCUMENT_BUCKET],
		['counseling_records', COUNSELING_BUCKET]
	] as const) {
		addFile(table, `${table}-active-first`, 1, null);
		addFile(table, `${table}-recent-first`, 1, RECENT);
		addFile(table, `${table}-active-second`, 2, null);
		for (const [parent, label] of [
			[3, 'active'],
			[4, 'recent'],
			[5, 'cutoff'],
			[6, 'foreign']
		] as const)
			addFile(table, `${table}-${label}`, parent, null);
		state.rows[table].push(
			{ id: `${table}-null`, organization_id: ORG, personnel_id: personId(1), file_path: null },
			{ id: `${table}-empty`, organization_id: ORG, personnel_id: personId(1), file_path: '' }
		);
		state.files.set(`${bucket}:${ORG}/unrelated.pdf`, [8, 9]);
	}

	const client = createClient('http://127.0.0.1:9', 'synthetic-retention-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const resource = url.pathname.split('/').at(-1);
				// Exercise the actual regression boundary rather than pinning query calls.
				if (url.href.length > 8192) return new Response('URI too long', { status: 414 });
				if (resource === 'delete_expired_personnel' && init?.method === 'POST') {
					const args = JSON.parse(String(init.body)) as DeleteInput;
					state.rpcInputs.push(args);
					if (state.rpcFailure)
						return Response.json({ code: '23503', message: 'parent deletion rejected' }, { status: 409 });
					state.beforeDelete();
					const removed = new Set(
						state.rows.personnel
							.filter(
								(row) =>
									row.organization_id === args.p_org_id &&
									args.p_candidate_ids.includes(row.id) &&
									row.archived_at != null &&
									Date.parse(row.archived_at) < Date.parse(args.p_cutoff)
							)
							.map((row) => row.id)
					);
					state.rows.personnel = state.rows.personnel.filter((row) => !removed.has(row.id));
					for (const table of ['personnel_documents', 'counseling_records'] as const)
						state.rows[table] = state.rows[table].filter((row) => !row.personnel_id || !removed.has(row.personnel_id));
					return Response.json(state.countOverride === undefined ? removed.size : state.countOverride);
				}
				if (!resource || !(resource in state.rows) || (init?.method ?? 'GET') !== 'GET')
					throw new Error(`Unexpected synthetic provider request: ${init?.method ?? 'GET'} ${resource}`);
				const table = resource as Table;
				const params = url.searchParams;
				const ids = inIds(params.get(table === 'personnel' ? 'id' : 'personnel_id'));
				const stage = table !== 'personnel' ? 'manifest' : ids ? 'confirmation' : 'discovery';
				const offset = Number(params.get('offset') ?? 0);
				if (state.readFailure?.(table, stage, ids, offset))
					return Response.json({ message: `${stage} unavailable` }, { status: 500 });
				const archiveFilters = params.getAll('archived_at');
				const cutoff = archiveFilters.find((filter) => filter.startsWith('lt.'))?.slice(3);
				let rows = state.rows[table].filter(
					(row) =>
						(!params.has('organization_id') || params.get('organization_id') === `eq.${row.organization_id}`) &&
						(!ids || ids.includes(table === 'personnel' ? row.id : (row.personnel_id ?? ''))) &&
						(!archiveFilters.includes('not.is.null') || row.archived_at != null) &&
						(!cutoff || (row.archived_at != null && Date.parse(row.archived_at) < Date.parse(cutoff)))
				);
				if (params.get('order') === 'id.asc') rows = [...rows].sort((a, b) => a.id.localeCompare(b.id));
				const limit = Math.min(1000, Number(params.get('limit') ?? 1000));
				const fields = params
					.get('select')
					?.split(',')
					.map((field) => field.trim());
				return Response.json(
					rows
						.slice(offset, offset + limit)
						.map((row) => (fields ? Object.fromEntries(fields.map((field) => [field, row[field as keyof Row]])) : row))
				);
			}
		}
	});
	const storage = {
		remove: vi.fn(async (bucket: string, paths: string[]) => {
			for (const path of paths) state.files.delete(`${bucket}:${path}`);
		})
	};
	return { state, storage, addFile, source: createSupabasePersonnelRetentionSource(client, storage) };
}

function snapshot(state: ReturnType<typeof fixture>['state']) {
	return structuredClone({ rows: state.rows, files: state.files });
}

function retainedFileKeys() {
	return [
		...['personnel_documents', 'counseling_records'].flatMap((table) => {
			const bucket = table === 'personnel_documents' ? DOCUMENT_BUCKET : COUNSELING_BUCKET;
			return ['active', 'recent', 'cutoff', 'foreign'].map(
				(label) => `${bucket}:${label === 'foreign' ? FOREIGN_ORG : ORG}/${table}-${label}.pdf`
			);
		}),
		`${DOCUMENT_BUCKET}:${ORG}/unrelated.pdf`,
		`${COUNSELING_BUCKET}:${ORG}/unrelated.pdf`
	].sort();
}

function largeFixture() {
	const run = fixture();
	// Together with the two original expired parents, this is 1,001 candidates.
	for (let index = 7; index <= 1005; index++)
		run.state.rows.personnel.unshift({ id: personId(index), organization_id: ORG, archived_at: EXPIRED });
	for (const table of ['personnel_documents', 'counseling_records'] as const)
		run.addFile(table, `${table}-last-parent`, 1005, null);
	return run;
}

describe('Personnel scheduled parent retention', () => {
	it('captures active/recent child files before cascade and retains cutoff, active, recent and foreign parents', async () => {
		const { source, state } = fixture();
		const before = snapshot(state);

		await expect(source.deleteExpired(ORG, CUTOFF)).resolves.toBe(2);

		expect(state.rows.personnel).toEqual(before.rows.personnel.slice(2));
		for (const table of ['personnel_documents', 'counseling_records'] as const)
			expect(state.rows[table]).toEqual(
				before.rows[table].filter((row) => row.personnel_id !== personId(1) && row.personnel_id !== personId(2))
			);
		expect([...state.files.keys()].sort()).toEqual(retainedFileKeys());
		for (const [key, bytes] of state.files) expect(bytes).toEqual(before.files.get(key));
		const retryBefore = snapshot(state);
		await expect(source.deleteExpired(ORG, CUTOFF)).resolves.toBe(0);
		expect(snapshot(state)).toEqual(retryBefore);
	});

	it('handles 1,001 parents and more than one result page in each child manifest using one atomic mutation', async () => {
		const { source, state, addFile } = largeFixture();
		for (const table of ['personnel_documents', 'counseling_records'] as const)
			for (let index = 0; index < 1001; index++) addFile(table, `${table}-dense-${index}`, 1, null);
		const before = snapshot(state);

		await expect(source.deleteExpired(ORG, CUTOFF)).resolves.toBe(1001);

		expect(state.rows.personnel.map((row) => row.id)).toEqual([personId(3), personId(4), personId(5), personId(6)]);
		expect([...state.files.keys()].sort()).toEqual(retainedFileKeys());
		for (const [key, bytes] of state.files) expect(bytes).toEqual(before.files.get(key));
		// Splitting mutations into independently committed cohorts breaks batch rollback.
		expect(state.rpcInputs).toHaveLength(1);
		expect(state.rpcInputs[0].p_candidate_ids).toHaveLength(1001);
	});

	it('removes only confirmed absent parents’ files when another candidate is restored before deletion', async () => {
		const { source, state } = fixture();
		const before = snapshot(state);
		state.beforeDelete = () => {
			state.rows.personnel[1].archived_at = null;
		};

		await expect(source.deleteExpired(ORG, CUTOFF)).resolves.toBe(1);

		expect(state.rows.personnel).toEqual([
			{ id: personId(2), organization_id: ORG, archived_at: null },
			...before.rows.personnel.slice(2)
		]);
		expect([...state.files.keys()].sort()).toEqual(
			[
				...retainedFileKeys(),
				`${DOCUMENT_BUCKET}:${ORG}/personnel_documents-active-second.pdf`,
				`${COUNSELING_BUCKET}:${ORG}/counseling_records-active-second.pdf`
			].sort()
		);
		for (const [key, bytes] of state.files) expect(bytes).toEqual(before.files.get(key));
	});

	it('does not remove files when the atomic deletion removes no candidates', async () => {
		const { source, state } = fixture();
		const files = structuredClone(state.files);
		state.beforeDelete = () => {
			state.rows.personnel[0].archived_at = null;
			state.rows.personnel[1].archived_at = null;
		};

		await expect(source.deleteExpired(ORG, CUTOFF)).resolves.toBe(0);

		expect(state.files).toEqual(files);
	});

	it('does not mutate anything without expired parents', async () => {
		const { source, state } = fixture();
		state.rows.personnel[0].archived_at = RECENT;
		state.rows.personnel[1].archived_at = RECENT;
		const before = snapshot(state);

		await expect(source.deleteExpired(ORG, CUTOFF)).resolves.toBe(0);

		expect(snapshot(state)).toEqual(before);
		expect(state.rpcInputs).toEqual([]);
	});

	it('discards an incomplete discovery page before mutation', async () => {
		const { source, state } = largeFixture();
		const before = snapshot(state);
		state.readFailure = (_table, stage, _ids, offset) => stage === 'discovery' && offset === 1000;

		await expect(source.deleteExpired(ORG, CUTOFF)).rejects.toThrow('discovery unavailable');

		expect(snapshot(state)).toEqual(before);
		expect(state.rpcInputs).toEqual([]);
	});

	it.each(['personnel_documents', 'counseling_records'] as const)(
		'keeps every parent and file when a late %s manifest cohort fails',
		async (failedTable) => {
			const { source, state } = largeFixture();
			const before = snapshot(state);
			state.readFailure = (table, stage, ids) =>
				table === failedTable && stage === 'manifest' && !!ids?.includes(personId(1005));

			await expect(source.deleteExpired(ORG, CUTOFF)).rejects.toThrow('manifest unavailable');

			expect(snapshot(state)).toEqual(before);
			expect(state.rpcInputs).toEqual([]);
		}
	);

	it('keeps every parent and file when a later page within one manifest fails', async () => {
		const { source, state, addFile } = fixture();
		for (let index = 0; index < 1001; index++) addFile('personnel_documents', `dense-${index}`, 1, null);
		const before = snapshot(state);
		state.readFailure = (_table, stage, _ids, offset) => stage === 'manifest' && offset === 1000;

		await expect(source.deleteExpired(ORG, CUTOFF)).rejects.toThrow('manifest unavailable');

		expect(snapshot(state)).toEqual(before);
		expect(state.rpcInputs).toEqual([]);
	});

	it('retains all rows and files when the database rejects parent deletion', async () => {
		const { source, state } = fixture();
		const before = snapshot(state);
		state.rpcFailure = true;

		await expect(source.deleteExpired(ORG, CUTOFF)).rejects.toThrow('parent deletion rejected');

		expect(snapshot(state)).toEqual(before);
	});

	it('retains every file when a late confirmation fails after durable parent cascade', async () => {
		const { source, state } = largeFixture();
		const files = structuredClone(state.files);
		state.readFailure = (_table, stage, ids) => stage === 'confirmation' && !!ids?.includes(personId(1005));

		await expect(source.deleteExpired(ORG, CUTOFF)).rejects.toThrow('confirmation unavailable');

		expect(state.rows.personnel.map((row) => row.id)).toEqual([personId(3), personId(4), personId(5), personId(6)]);
		expect(
			state.rows.personnel_documents.every((row) => [3, 4, 5, 6].some((id) => row.personnel_id === personId(id)))
		).toBe(true);
		expect(state.files).toEqual(files);
	});

	it.each([null, -1, 1.5])('rejects an invalid deletion count %s without removing files', async (count) => {
		const { source, state } = fixture();
		const files = structuredClone(state.files);
		state.countOverride = count;

		await expect(source.deleteExpired(ORG, CUTOFF)).rejects.toThrow('no valid deletion count');

		expect(state.files).toEqual(files);
	});

	it.each([DOCUMENT_BUCKET, COUNSELING_BUCKET])(
		'waits for the other bucket before reporting %s removal failure',
		async (failedBucket) => {
			const { source, state, storage } = fixture();
			const before = snapshot(state);
			const remove = storage.remove.getMockImplementation()!;
			let releaseOther!: () => void;
			let otherStarted!: () => void;
			const gate = new Promise<void>((resolve) => {
				releaseOther = resolve;
			});
			const started = new Promise<void>((resolve) => {
				otherStarted = resolve;
			});
			storage.remove.mockImplementation(async (bucket, paths) => {
				if (bucket === failedBucket) throw new Error('one bucket unavailable');
				otherStarted();
				await gate;
				await remove(bucket, paths);
			});
			let settled = false;
			const result = source.deleteExpired(ORG, CUTOFF).then(
				() => {
					settled = true;
					return null;
				},
				(error: unknown) => {
					settled = true;
					return error;
				}
			);
			await started;
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(settled).toBe(false);
			releaseOther();

			expect(await result).toMatchObject({ message: 'one bucket unavailable' });
			expect(state.rows.personnel).toEqual(before.rows.personnel.slice(2));
			expect([...state.files.keys()].sort()).toEqual(
				[
					...retainedFileKeys(),
					...[...before.files.keys()].filter(
						(key) => key.startsWith(`${failedBucket}:`) && !retainedFileKeys().includes(key)
					)
				].sort()
			);
		}
	);
});
