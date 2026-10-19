import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';
import { createSupabaseOrganizationDestructionPort } from './destructionProvider.server';

const orgA = 'abcdefab-1234-4234-8234-abcdefabcdef';
const mixedA = 'Abcdefab-1234-4234-8234-abcdefabcdef';
const orgB = 'bbbbbbbb-1234-4234-8234-bbbbbbbbbbbb';
const foreign = `${orgB}/foreign.pdf`;
const caseSiblings = [orgA, orgA.toUpperCase(), mixedA].map((id) => `${id}/orphan/nested.pdf`);
const object = (name: string) => ({ name, id: '11111111-1111-4111-8111-111111111111' });
const page = (names: string[]) => ({ hasNext: false, folders: [], objects: names.map(object) });

function provider() {
	const objects = new Map<string, Set<string>>([
		[
			'counseling-files',
			new Set([`${orgA}/root.pdf`, ...caseSiblings, `${orgA}-extra/lookalike.pdf`, foreign, orgA, `${orgA}/`])
		],
		['personnel-documents', new Set([`${orgA}/documents/a.pdf`, foreign])],
		['training-certificates', new Set([`${orgA}/personnel/p/training-certificates/c/card.pdf`, foreign])]
	]);
	const state = {
		acknowledgement: 'exact',
		authority: true as unknown,
		deleteIds: [orgA],
		listingFaultAt: null as number | null,
		listingReplies: null as unknown[] | null,
		removalFault: false,
		parentFault: false
	};
	const listings: Array<{ bucket: string; body: Record<string, unknown> }> = [];
	const removals: Array<{ bucket: string; paths: string[] }> = [];
	const deletions: URL[] = [];
	const cursorOffsets = new Map<string, Map<string, number>>();
	const fetch: typeof globalThis.fetch = async (input, init) => {
		const url = new URL(String(input));
		const payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
		const bucket = url.pathname.split('/').at(-1)!;
		if (url.pathname.includes('/object/list-v2/')) {
			listings.push({ bucket, body: payload });
			if (state.listingFaultAt === listings.length)
				return Response.json({ message: 'provider failure' }, { status: 503 });
			if (state.listingReplies) return Response.json(state.listingReplies.shift());
			const sort = payload.sortBy as { column?: string; order?: string } | undefined;
			if (
				init?.method !== 'POST' ||
				payload.prefix !== '' ||
				payload.with_delimiter !== false ||
				payload.limit !== 1000 ||
				sort?.column !== 'name' ||
				sort?.order !== 'asc' ||
				!objects.has(bucket)
			)
				return Response.json({ message: 'Unsupported listing' }, { status: 400 });
			const offsets = cursorOffsets.get(bucket) ?? new Map<string, number>();
			cursorOffsets.set(bucket, offsets);
			const start = payload.cursor === undefined ? 0 : offsets.get(String(payload.cursor));
			if (start === undefined) return Response.json({ message: 'Invalid cursor' }, { status: 400 });
			// Storage supplies ordered full-key pages. The consumer must not
			// reconstruct folders or infer cursor contents or JavaScript collation.
			const keys = [...objects.get(bucket)!].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
			const end = start + 1000;
			const hasNext = end < keys.length;
			const nextCursor = hasNext ? `opaque/${bucket}?after=${end}+unchanged` : undefined;
			if (nextCursor) offsets.set(nextCursor, end);
			return Response.json({
				hasNext,
				folders: [],
				objects: keys.slice(start, end).map(object),
				nextCursor
			});
		}
		if (url.pathname.includes('/storage/v1/object/') && init?.method === 'DELETE') {
			const paths = payload.prefixes as string[];
			removals.push({ bucket, paths });
			if (state.removalFault) return Response.json({ message: 'provider failure' }, { status: 503 });
			for (const path of paths) objects.get(bucket)!.delete(path);
			const acknowledged =
				state.acknowledgement === 'missing'
					? paths.slice(1)
					: state.acknowledgement === 'foreign'
						? [foreign]
						: state.acknowledgement === 'duplicate'
							? [paths[0], paths[0]]
							: paths;
			return Response.json(acknowledged.map((name) => ({ name })));
		}
		if (url.pathname.includes('/rpc/')) return Response.json(state.authority);
		if (init?.method === 'DELETE') {
			deletions.push(url);
			if (state.parentFault) return Response.json({ message: 'provider failure' }, { status: 503 });
			return Response.json(state.deleteIds.map((id) => ({ id })));
		}
		return Response.json({ name: 'Saved Name' });
	};
	const supabase = createClient('http://ordinary-client.test', 'synthetic-public-key', {
		global: { fetch },
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
	const port = createSupabaseOrganizationDestructionPort({ supabase } as Pick<App.Locals, 'supabase'>);
	return { port, state, objects, listings, removals, deletions };
}

describe('Organization destruction ordinary SDK provider', () => {
	it('retains full raw case-distinct keys and consumes opaque cursors past 1000 objects', async () => {
		const { port, objects, listings, removals, deletions } = provider();
		const documents = Array.from({ length: 1005 }, (_, n) => `${orgA}/documents/${n}.pdf`);
		for (const path of documents) objects.get('personnel-documents')!.add(path);
		const files = await port.discoverFiles(orgA.toUpperCase());
		expect(new Set(files.filter((file) => file.bucket === 'counseling-files').map((file) => file.path))).toEqual(
			new Set([`${orgA}/root.pdf`, ...caseSiblings, `${orgA}/`])
		);
		expect(new Set(files.filter((file) => file.bucket === 'personnel-documents').map((file) => file.path))).toEqual(
			new Set([`${orgA}/documents/a.pdf`, ...documents])
		);
		expect(files.filter((file) => file.bucket === 'training-certificates').map((file) => file.path)).toEqual([
			`${orgA}/personnel/p/training-certificates/c/card.pdf`
		]);
		expect(listings.filter((request) => request.bucket === 'personnel-documents')[1].body.cursor).toBe(
			'opaque/personnel-documents?after=1000+unchanged'
		);
		expect(removals).toEqual([]);
		expect(deletions).toEqual([]);
	});
	it('accepts an optional key only when it preserves the same full raw name', async () => {
		const { port, state } = provider();
		state.listingReplies = [
			{ ...page([]), objects: [{ ...object(caseSiblings[1]), key: caseSiblings[1] }] },
			page([]),
			page([])
		];
		expect(await port.discoverFiles(orgA)).toEqual([{ bucket: 'counseling-files', path: caseSiblings[1] }]);
	});
	it.each([
		['missing data', null],
		['nonboolean continuation', { ...page([]), hasNext: 'false' }],
		['missing objects', { hasNext: false, folders: [] }],
		['nonarray folders', { ...page([]), folders: null }],
		['unexpected folders', { ...page([]), folders: [{ name: orgA }] }],
		['null object', { ...page([]), objects: [null] }],
		['empty name', { ...page([]), objects: [object('')] }],
		['nonstring name', { ...page([]), objects: [{ ...object(orgA), name: 1 }] }],
		['empty ID', { ...page([]), objects: [{ name: `${orgA}/file.pdf`, id: '' }] }],
		['null ID', { ...page([]), objects: [{ name: `${orgA}/file.pdf`, id: null }] }],
		['different full key', { ...page([]), objects: [{ ...object(caseSiblings[1]), key: caseSiblings[0] }] }],
		['overfull page', page(Array.from({ length: 1001 }, (_, n) => `${orgA}/${n}.pdf`))],
		['duplicate keys', page([`${orgA}/same.pdf`, `${orgA}/same.pdf`])],
		['missing cursor', { ...page([`${orgA}/file.pdf`]), hasNext: true }],
		['empty cursor', { ...page([`${orgA}/file.pdf`]), hasNext: true, nextCursor: '' }],
		['nonstring cursor', { ...page([`${orgA}/file.pdf`]), hasNext: true, nextCursor: 1 }],
		['empty continuing page', { ...page([]), hasNext: true, nextCursor: 'opaque-next' }]
	])('rejects %s before any cleanup effect', async (_name, response) => {
		const { port, state, removals, deletions } = provider();
		state.listingReplies = [response];
		await expect(port.discoverFiles(orgA)).rejects.toThrow();
		expect(removals).toEqual([]);
		expect(deletions).toEqual([]);
	});
	it.each(['repeated cursor', 'duplicate key across pages'])('rejects %s during discovery', async (fault) => {
		const { port, state, removals, deletions } = provider();
		state.listingReplies = [
			{ ...page([`${orgA}/first.pdf`]), hasNext: true, nextCursor: 'opaque-next' },
			fault === 'repeated cursor'
				? { ...page([`${orgA}/second.pdf`]), hasNext: true, nextCursor: 'opaque-next' }
				: page([`${orgA}/first.pdf`])
		];
		await expect(port.discoverFiles(orgA)).rejects.toThrow();
		expect(removals).toEqual([]);
		expect(deletions).toEqual([]);
	});
	it('requires literal true authority and propagates a later-page listing fault without effects', async () => {
		const { port, state, objects, removals, deletions } = provider();
		for (const value of [null, 'true', 1, false]) {
			state.authority = value;
			expect(await port.hasCurrentCleanupAuthority(orgA)).toBe(false);
		}
		state.authority = true;
		expect(await port.hasCurrentCleanupAuthority(orgA)).toBe(true);
		for (let n = 0; n < 1001; n++) objects.get('counseling-files')!.add(`${orgA}/${n}.pdf`);
		state.listingFaultAt = 2;
		await expect(port.discoverFiles(orgA)).rejects.toThrow();
		expect(removals).toEqual([]);
		expect(deletions).toEqual([]);
	});
	it.each(['missing', 'foreign', 'duplicate'])(
		'does not accept a %s removal acknowledgement',
		async (acknowledgement) => {
			const { port, state } = provider();
			state.acknowledgement = acknowledgement;
			await expect(port.removeFiles(orgA, 'counseling-files', caseSiblings.slice(0, 2))).rejects.toThrow();
		}
	);
	it('removes only exact scoped paths and validates the maximum batch before sending effects', async () => {
		const { port, objects, removals } = provider();
		for (const paths of [[foreign], [], [caseSiblings[0], caseSiblings[0]], [orgA]])
			await expect(port.removeFiles(orgA, 'counseling-files', paths)).rejects.toThrow();
		await expect(
			port.removeFiles(
				orgA,
				'counseling-files',
				Array.from({ length: 1001 }, (_, n) => `${orgA}/${n}.pdf`)
			)
		).rejects.toThrow();
		expect(removals).toEqual([]);
		await port.removeFiles(orgA.toUpperCase(), 'counseling-files', caseSiblings);
		for (const path of caseSiblings) expect(objects.get('counseling-files')!.has(path)).toBe(false);
		expect(objects.get('counseling-files')!.has(foreign)).toBe(true);
		expect(objects.get('counseling-files')!.has(`${orgA}/root.pdf`)).toBe(true);
	});
	it('removes a real trailing-slash key by exact acknowledgement while preserving other objects', async () => {
		const { port, objects, removals } = provider();
		await port.removeFiles(orgA, 'counseling-files', [`${orgA}/`]);
		expect(removals).toEqual([{ bucket: 'counseling-files', paths: [`${orgA}/`] }]);
		expect(objects.get('counseling-files')!.has(`${orgA}/`)).toBe(false);
		expect(objects.get('counseling-files')!.has(orgA)).toBe(true);
		expect(objects.get('counseling-files')!.has(foreign)).toBe(true);
		for (const path of caseSiblings) expect(objects.get('counseling-files')!.has(path)).toBe(true);
	});
	it('propagates removal failure while retaining objects', async () => {
		const { port, state, objects } = provider();
		state.removalFault = true;
		await expect(port.removeFiles(orgA, 'counseling-files', caseSiblings)).rejects.toThrow();
		for (const path of caseSiblings) expect(objects.get('counseling-files')!.has(path)).toBe(true);
	});
	it('conditions the parent write on canonical ID and exact persisted name, requiring its returned ID', async () => {
		const { port, state, deletions } = provider();
		expect(await port.deleteConfirmedTarget(orgA.toUpperCase(), 'Saved   Name')).toBe(true);
		expect(deletions[0].searchParams.get('id')).toBe(`eq.${orgA}`);
		expect(deletions[0].searchParams.get('name')).toBe('eq.Saved   Name');
		for (const ids of [[], [orgB], [orgA, orgB]]) {
			state.deleteIds = ids;
			expect(await port.deleteConfirmedTarget(orgA, 'Saved Name')).toBe(false);
		}
		state.parentFault = true;
		await expect(port.deleteConfirmedTarget(orgA, 'Saved Name')).rejects.toThrow();
	});
});
