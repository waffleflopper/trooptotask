import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseStorageAdapter } from '$lib/server/adapters/supabaseStorage';
import { createSupabasePersonnelArtifactRetentionSource } from './personnelArtifactRetention.server';

const ORG = 'd130b000-0000-4000-8000-000000000001';
const FOREIGN_ORG = 'd130b000-0000-4000-8000-000000000002';
const PARENT = 'd130a000-0000-4000-8000-000000000001';
const FOREIGN_PARENT = 'd130a000-0000-4000-8000-000000000002';
const CUTOFF = '2023-10-01T12:00:00.000Z';
const EXPIRED = '2000-01-01T12:00:00.000Z';
const RECENT = '2026-09-30T12:00:00.000Z';
const URL_CEILING = 8192;
const REPRESENTATION_CAP = 1000;
// Supabase Storage's documented remove limit, independent of source batching.
const STORAGE_PREFIX_CAP = 1000;
const families = [
	{ table: 'personnel_follow_ups', method: 'deleteExpiredFollowUps', index: 1 },
	{ table: 'counseling_records', method: 'deleteExpiredCounselingRecords', index: 2, bucket: 'counseling-files' },
	{ table: 'personnel_documents', method: 'deleteExpiredDocuments', index: 3, bucket: 'personnel-documents' },
	{ table: 'leader_notes', method: 'deleteExpiredLeaderNotes', index: 4 }
] as const;
type Family = (typeof families)[number];
type Failure = 'discovery' | 'delete' | 'confirmation' | 'storage' | 'storage-late';
interface Row {
	id: string;
	organization_id: string;
	personnel_id: string;
	archived_at: string | null;
	status?: string;
	completed_at?: string;
	file_path?: string | null;
}
interface Receipt {
	method: string;
	urlBytes: number;
	ids: string[] | null;
	status?: number;
	removedIds?: string[];
	storagePaths?: string[];
	removedPaths?: string[];
}

function rowId(family: Family, index: number) {
	return `d130${family.index.toString(16).padStart(4, '0')}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}
function bucketFor(family: Family) {
	return 'bucket' in family ? family.bucket : null;
}
function rowFor(family: Family, index: number, org: string, archived: string | null): Row {
	const id = rowId(family, index);
	const parent = org === ORG ? PARENT : FOREIGN_PARENT;
	return {
		id,
		organization_id: org,
		personnel_id: parent,
		archived_at: archived,
		...(family.table === 'personnel_follow_ups' ? { status: archived ? 'archived' : 'open' } : {}),
		...(bucketFor(family)
			? {
					file_path:
						family.table === 'personnel_documents'
							? `${org}/personnel/${parent}/documents/${id}-synthetic.pdf`
							: `${org}/counseling-records/${parent}/${id}-synthetic.pdf`
				}
			: {})
	};
}
function inIds(filter: string | null) {
	return filter?.startsWith('in.(') ? filter.slice(4, -1).split(',') : null;
}

/** Actual SDK serialization against a finite REST model, not live SQL/RLS or Storage. */
function fixture(family: Family, count: number, failure?: Failure) {
	const expired = Array.from({ length: count }, (_, index) => rowFor(family, index + 1, ORG, EXPIRED));
	const retained = [
		rowFor(family, 2001, ORG, null),
		rowFor(family, 2002, ORG, RECENT),
		rowFor(family, 2003, ORG, CUTOFF),
		rowFor(family, 2004, FOREIGN_ORG, EXPIRED),
		rowFor(family, 2005, FOREIGN_ORG, null),
		rowFor(family, 2006, FOREIGN_ORG, RECENT)
	];
	if (family.table === 'personnel_follow_ups')
		retained.push(
			{ ...rowFor(family, 2007, ORG, null), status: 'completed', completed_at: EXPIRED },
			{ ...rowFor(family, 2008, ORG, EXPIRED), status: 'completed', completed_at: EXPIRED }
		);
	const state = {
		parents: [
			{ id: PARENT, organization_id: ORG, archived_at: null },
			{ id: FOREIGN_PARENT, organization_id: FOREIGN_ORG, archived_at: null }
		],
		rows: structuredClone([...expired].reverse().concat(retained)),
		files: new Map<string, Buffer>(),
		receipts: [] as Receipt[],
		preservedIds: new Set<string>(),
		confirmationFailure: false
	};
	const bucket = bucketFor(family);
	if (bucket) {
		for (const row of [...expired, ...retained])
			state.files.set(`${bucket}:${row.file_path}`, Buffer.from(`finite synthetic bytes for ${row.id}`));
		state.files.set(`${bucket}:${ORG}/verification-retention/unrelated.pdf`, Buffer.from('unrelated retained bytes'));
	}
	let readNumber = 0;
	const client = createClient('http://127.0.0.1:9', 'synthetic-artifact-retention-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const method = init?.method ?? 'GET';
				const resource = url.pathname.split('/').at(-1)!;
				const params = url.searchParams;
				const receipt: Receipt = { method, urlBytes: Buffer.byteLength(url.href), ids: inIds(params.get('id')) };
				state.receipts.push(receipt);
				const reject = (status: number, message: string) => {
					receipt.status = status;
					return Response.json({ message }, { status });
				};
				if (receipt.urlBytes > URL_CEILING) return reject(414, 'URI too long');
				if (url.pathname.startsWith('/storage/v1/object/')) {
					if (method !== 'DELETE' || resource !== bucket) throw new Error('Unexpected finite Storage request');
					const { prefixes } = JSON.parse(String(init?.body)) as { prefixes: string[] };
					receipt.storagePaths = prefixes;
					if (prefixes.length > STORAGE_PREFIX_CAP) return reject(400, 'storage removal accepts at most 1000 prefixes');
					if (failure === 'storage') return reject(403, 'storage removal rejected');
					if (failure === 'storage-late' && prefixes.includes(expired.at(-1)!.file_path!))
						return reject(403, 'later storage removal rejected');
					const removed = prefixes.filter((path) => state.files.delete(`${resource}:${path}`));
					receipt.removedPaths = removed;
					receipt.status = 200;
					return Response.json(removed.map((name) => ({ name })));
				}
				if (!url.pathname.startsWith('/rest/v1/') || resource !== family.table || !['GET', 'DELETE'].includes(method))
					throw new Error(`Unexpected finite REST request: ${method} ${url.pathname}`);
				const offset = Number(params.get('offset') ?? 0);
				if (method === 'GET') {
					readNumber++;
					if (failure === 'discovery' && !receipt.ids && offset >= REPRESENTATION_CAP)
						return reject(403, 'later discovery rejected');
					if ((failure === 'confirmation' || state.confirmationFailure) && receipt.ids?.includes(expired.at(-1)!.id))
						return reject(403, 'later confirmation rejected');
				}
				let rows = state.rows.filter((row) =>
					[...params].every(([key, filter]) => {
						if (['select', 'offset', 'limit', 'order'].includes(key)) return true;
						if (key === 'organization_id') return filter === `eq.${row.organization_id}`;
						if (key === 'status') return filter === `eq.${row.status}`;
						if (key === 'id') return inIds(filter)?.includes(row.id) ?? filter === `eq.${row.id}`;
						if (key === 'archived_at') {
							if (filter === 'not.is.null') return row.archived_at !== null;
							if (filter.startsWith('lt.'))
								return row.archived_at !== null && Date.parse(row.archived_at) < Date.parse(filter.slice(3));
						}
						throw new Error(`Unsupported finite REST filter: ${key} ${filter}`);
					})
				);
				if (method === 'DELETE') {
					if (failure === 'delete' && receipt.ids?.includes(expired.at(-1)!.id))
						return reject(403, 'later deletion rejected');
					rows = rows.filter((row) => !state.preservedIds.has(row.id));
					const removed = new Set(rows.map((row) => row.id));
					state.rows = state.rows.filter((row) => !removed.has(row.id));
					receipt.removedIds = [...removed];
				}
				// REST offers no ordering guarantee unless one was requested. Varying
				// the default exposes missing discovery ordering through incorrect sets.
				rows.sort((a, b) => a.id.localeCompare(b.id));
				if (method === 'GET' && params.get('order') !== 'id.asc' && readNumber % 2 === 0) rows.reverse();
				const limit = Math.min(REPRESENTATION_CAP, Number(params.get('limit') ?? REPRESENTATION_CAP));
				const fields = params
					.get('select')
					?.split(',')
					.map((field) => field.trim());
				receipt.status = 200;
				return Response.json(
					rows
						.slice(offset, offset + limit)
						.map((row) => (fields ? Object.fromEntries(fields.map((field) => [field, row[field as keyof Row]])) : row))
				);
			}
		}
	});
	return {
		state,
		expired,
		retained,
		bucket,
		deleteExpired: () =>
			createSupabasePersonnelArtifactRetentionSource(client, createSupabaseStorageAdapter(client))[family.method](
				ORG,
				CUTOFF
			)
	};
}

function snapshot(state: ReturnType<typeof fixture>['state']) {
	return {
		parents: structuredClone(state.parents),
		rows: structuredClone(state.rows),
		files: [...state.files]
			.map(([path, bytes]) => ({
				path,
				bytes: [...bytes],
				sha256: createHash('sha256').update(bytes).digest('hex')
			}))
			.sort((a, b) => a.path.localeCompare(b.path))
	};
}
function sortedIds(rows: Row[]) {
	return rows.map((row) => row.id).sort();
}

describe('Personnel scheduled artifact retention', () => {
	it.each(families)(
		'$method deletes all 1,001 expired artifacts and keeps active, recent, cutoff-equal and foreign records',
		async (family) => {
			const run = fixture(family, 1001);
			const before = snapshot(run.state);
			await expect(run.deleteExpired()).resolves.toBe(1001);
			expect(sortedIds(run.state.rows)).toEqual(sortedIds(run.retained));
			expect(run.state.rows).toEqual(
				before.rows.filter((row) => run.retained.some((retained) => retained.id === row.id))
			);
			expect(run.state.parents).toEqual(before.parents);
			const expiredPaths = new Set(run.expired.map((row) => `${run.bucket}:${row.file_path}`));
			expect(snapshot(run.state).files).toEqual(before.files.filter((file) => !expiredPaths.has(file.path)));
			expect(Math.max(...run.state.receipts.map((receipt) => receipt.urlBytes))).toBeLessThanOrEqual(URL_CEILING);
			const after = snapshot(run.state);
			await expect(run.deleteExpired()).resolves.toBe(0);
			expect(snapshot(run.state)).toEqual(after);
		}
	);

	it('does not delete rows or files when a later discovery page fails', async () => {
		const run = fixture(families[2], 1001, 'discovery');
		const before = snapshot(run.state);
		await expect(run.deleteExpired()).rejects.toThrow('later discovery rejected');
		expect(snapshot(run.state)).toEqual(before);
		expect(run.state.receipts.some((receipt) => receipt.method === 'DELETE')).toBe(false);
	});

	it('preserves every file after a later deletion fails, while retaining earlier DB effects', async () => {
		const run = fixture(families[2], 1001, 'delete');
		const before = snapshot(run.state);
		await expect(run.deleteExpired()).rejects.toThrow('later deletion rejected');
		const rejectedIds = run.state.receipts.find((receipt) => receipt.status === 403)!.ids!;
		expect(sortedIds(run.state.rows)).toEqual([...sortedIds(run.retained), ...rejectedIds].sort());
		expect(run.state.rows.length).toBeLessThan(before.rows.length);
		expect(snapshot(run.state).files).toEqual(before.files);
	});

	it('preserves every file when a later scoped confirmation fails after all row deletions', async () => {
		const run = fixture(families[1], 1001, 'confirmation');
		const before = snapshot(run.state);
		await expect(run.deleteExpired()).rejects.toThrow('later confirmation rejected');
		expect(sortedIds(run.state.rows)).toEqual(sortedIds(run.retained));
		expect(snapshot(run.state).files).toEqual(before.files);
	});

	it('reports Storage failure after row deletion without claiming rollback or recovering orphan files on replay', async () => {
		const run = fixture(families[2], 1, 'storage');
		const before = snapshot(run.state);
		await expect(run.deleteExpired()).rejects.toThrow('Storage remove failed: storage removal rejected');
		expect(sortedIds(run.state.rows)).toEqual(sortedIds(run.retained));
		expect(snapshot(run.state).files).toEqual(before.files);
		const after = snapshot(run.state);
		await expect(run.deleteExpired()).resolves.toBe(0);
		expect(snapshot(run.state)).toEqual(after);
	});

	it('preserves earlier object removals and failed files after a later Storage failure without recovering them on replay', async () => {
		const run = fixture(families[2], 1001, 'storage-late');
		const before = snapshot(run.state);
		await expect(run.deleteExpired()).rejects.toThrow('Storage remove failed: later storage removal rejected');
		expect(sortedIds(run.state.rows)).toEqual(sortedIds(run.retained));
		const failedPaths = run.state.receipts.find((receipt) => receipt.status === 403)!.storagePaths!;
		const failedFileKeys = new Set(failedPaths.map((path) => `${run.bucket}:${path}`));
		const expiredFileKeys = new Set(run.expired.map((row) => `${run.bucket}:${row.file_path}`));
		expect(snapshot(run.state).files).toEqual(
			before.files.filter((file) => !expiredFileKeys.has(file.path) || failedFileKeys.has(file.path))
		);
		expect(run.state.receipts.some((receipt) => (receipt.removedPaths?.length ?? 0) > 0)).toBe(true);
		expect(run.state.files.has(`${run.bucket}:${run.expired.at(-1)!.file_path}`)).toBe(true);
		const after = snapshot(run.state);
		await expect(run.deleteExpired()).resolves.toBe(0);
		expect(snapshot(run.state)).toEqual(after);
	});

	it('counts actual deletions and removes only the captured file of an absent row', async () => {
		const run = fixture(families[1], 2);
		run.state.preservedIds.add(run.expired[1].id);
		const before = snapshot(run.state);
		await expect(run.deleteExpired()).resolves.toBe(1);
		expect(sortedIds(run.state.rows)).toEqual([...sortedIds(run.retained), run.expired[1].id].sort());
		expect(snapshot(run.state).files).toEqual(
			before.files.filter((file) => file.path !== `${run.bucket}:${run.expired[0].file_path}`)
		);
		const after = snapshot(run.state);
		run.state.confirmationFailure = true;
		await expect(run.deleteExpired()).resolves.toBe(0);
		expect(snapshot(run.state)).toEqual(after);
	});

	it('deletes metadata with null or empty paths without requiring file confirmation', async () => {
		const run = fixture(families[1], 2, 'confirmation');
		run.state.rows.find((row) => row.id === run.expired[0].id)!.file_path = null;
		run.state.rows.find((row) => row.id === run.expired[1].id)!.file_path = '';
		for (const row of run.expired) run.state.files.delete(`${run.bucket}:${row.file_path}`);
		const before = snapshot(run.state);
		await expect(run.deleteExpired()).resolves.toBe(2);
		expect(sortedIds(run.state.rows)).toEqual(sortedIds(run.retained));
		expect(snapshot(run.state).files).toEqual(before.files);
	});
});
