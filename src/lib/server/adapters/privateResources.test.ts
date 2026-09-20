import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import type { MembershipRow } from '$lib/server/permissionContext';
import {
	GET as listDocuments,
	POST as uploadDocument
} from '../../../routes/org/[orgId]/api/personnel/[id]/documents/+server';
import { GET as downloadDocument } from '../../../routes/org/[orgId]/api/personnel/[id]/documents/[documentId]/download/+server';
import {
	PATCH as changeDocument,
	DELETE as deleteDocument
} from '../../../routes/org/[orgId]/api/personnel/[id]/documents/[documentId]/+server';
import {
	GET as downloadScan,
	POST as uploadScan,
	DELETE as unlinkScan
} from '../../../routes/org/[orgId]/api/sign-in-rosters/[id]/upload/+server';
import { DELETE as deleteRoster } from '../../../routes/org/[orgId]/api/sign-in-rosters/[id]/+server';
import { POST as createRoster } from '../../../routes/org/[orgId]/api/sign-in-rosters/+server';

const { adminClient } = vi.hoisted(() => ({ adminClient: vi.fn() }));
vi.mock('$lib/server/supabase', async (original) => ({
	...(await original<typeof import('$lib/server/supabase')>()),
	getAdminClient: adminClient
}));
const ORG = '11111111-1111-4111-8111-111111111111';
const FOREIGN_ORG = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const membership: MembershipRow = {
	role: 'member',
	member_preset: 'operator',
	capability_overrides: { personnel: 'configure', training: 'operate' },
	access_scope_kind: 'groups',
	access_scope_group_ids: ['alpha', 'bravo']
};
type Row = Record<string, unknown>;

function fixture(member: MembershipRow = membership) {
	const tables: Record<string, Row[]> = {
		organization_memberships: [{ ...member, user_id: USER, organization_id: ORG }],
		personnel: [
			{
				id: 'person-b',
				organization_id: ORG,
				group_id: 'bravo',
				first_name: 'Bea',
				last_name: 'Baker',
				rank: 'SGT',
				groups: { name: 'Bravo' }
			},
			{ id: 'person-c', organization_id: ORG, group_id: 'charlie' },
			{ id: 'ungrouped', organization_id: ORG, group_id: null },
			{ id: 'foreign', organization_id: FOREIGN_ORG, group_id: 'bravo' }
		],
		personnel_documents: [
			{
				id: 'doc-b',
				organization_id: ORG,
				personnel_id: 'person-b',
				title: 'Private B',
				file_path: `${ORG}/personnel/person-b/documents/b.pdf`,
				uploaded_by: USER,
				archived_at: null
			},
			{
				id: 'doc-c',
				organization_id: ORG,
				personnel_id: 'person-c',
				title: 'Private C',
				file_path: `${ORG}/personnel/person-c/documents/c.pdf`
			},
			{
				id: 'foreign-doc',
				organization_id: FOREIGN_ORG,
				personnel_id: 'foreign',
				title: 'Foreign secret',
				file_path: `${FOREIGN_ORG}/personnel/foreign/documents/f.pdf`
			}
		],
		sign_in_rosters: [
			{
				id: 'roster-b',
				organization_id: ORG,
				scope_group_ids: ['bravo'],
				signed_file_path: `${ORG}/sign-in-rosters/roster-b/b.pdf`
			},
			{
				id: 'mixed',
				organization_id: ORG,
				scope_group_ids: ['bravo', 'charlie'],
				signed_file_path: `${ORG}/sign-in-rosters/mixed/m.pdf`
			},
			{
				id: 'org-wide',
				organization_id: ORG,
				scope_group_ids: [],
				signed_file_path: `${ORG}/sign-in-rosters/org-wide/o.pdf`
			},
			{
				id: 'foreign-roster',
				organization_id: FOREIGN_ORG,
				scope_group_ids: ['bravo'],
				signed_file_path: `${FOREIGN_ORG}/sign-in-rosters/foreign-roster/f.pdf`
			}
		],
		audit_logs: []
	};
	const requests: { client: string; path: string; method: string; body: unknown }[] = [];
	const state = { failedTable: '', failSigning: false };
	// Real SDK and adapters; this transport applies emitted filters, with no implicit RLS.
	function client(kind: 'caller' | 'service') {
		return createClient(`http://${kind}.invalid`, `synthetic-${kind}-key`, {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					const method = init?.method ?? 'GET';
					const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
					requests.push({ client: kind, path: url.pathname, method, body });
					if (url.pathname.startsWith('/storage/')) {
						if (state.failSigning) return Response.json({ message: 'synthetic signing failure' }, { status: 500 });
						return Response.json({ signedURL: '/object/sign/synthetic-private-file' });
					}
					const table = url.pathname.split('/').at(-1)!;
					if (!(table in tables)) throw new Error(`Unexpected table: ${table}`);
					if (table === state.failedTable) return Response.json({ message: 'synthetic read failure' }, { status: 500 });
					if (method === 'POST') {
						const row = { id: 'created', ...body };
						tables[table].push(row);
						return Response.json(row, { status: 201 });
					}
					if (method !== 'GET') throw new Error(`Unexpected mutation: ${method} ${table}`);
					const rows = tables[table].filter((row) =>
						[...url.searchParams].every(([key, filter]) => {
							if (['select', 'order', 'limit', 'offset'].includes(key)) return true;
							if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
							if (filter.startsWith('in.(')) return filter.slice(4, -1).split(',').includes(String(row[key]));
							if (filter === 'is.null') return row[key] == null;
							if (filter.startsWith('cd.{'))
								return (
									Array.isArray(row[key]) &&
									row[key].every((value) => filter.slice(4, -1).split(',').includes(String(value)))
								);
							if (filter === 'not.eq.{}') return Array.isArray(row[key]) && row[key].length > 0;
							throw new Error(`Unexpected filter: ${key}=${filter}`);
						})
					);
					if (new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object')) {
						return rows.length === 1 ? Response.json(rows[0]) : Response.json({ code: 'PGRST116' }, { status: 406 });
					}
					return Response.json(rows);
				}
			}
		});
	}
	adminClient.mockReturnValue(client('service'));
	const locals = { user: { id: USER }, session: null, supabase: client('caller') } as App.Locals;
	return { tables, requests, state, locals };
}

function event(
	f: ReturnType<typeof fixture>,
	method: string,
	id: string,
	documentId = 'doc-b',
	body?: unknown
): RequestEvent {
	const url = new URL(`http://app.invalid/org/${ORG}/api/private-file`);
	const form = new FormData();
	form.set('file', new File(['%PDF-1.7'], 'synthetic.pdf', { type: 'application/pdf' }));
	return {
		locals: f.locals,
		params: { orgId: ORG, id, documentId },
		cookies: {},
		url,
		getClientAddress: () => '127.0.0.1',
		request: new Request(url, { method, ...(method === 'GET' ? {} : { body: body ? JSON.stringify(body) : form }) })
	} as RequestEvent;
}

const operations: { name: string; handler: RequestHandler; method: string; id: string; body?: unknown }[] = [
	{ name: 'document list', handler: listDocuments, method: 'GET', id: 'person-b' },
	{ name: 'document download', handler: downloadDocument, method: 'GET', id: 'person-b' },
	{ name: 'document upload', handler: uploadDocument, method: 'POST', id: 'person-b' },
	{ name: 'document archive', handler: changeDocument, method: 'PATCH', id: 'person-b', body: { action: 'archive' } },
	{ name: 'document restore', handler: changeDocument, method: 'PATCH', id: 'person-b', body: { action: 'restore' } },
	{ name: 'document delete', handler: deleteDocument, method: 'DELETE', id: 'person-b' },
	{ name: 'scan download', handler: downloadScan, method: 'GET', id: 'roster-b' },
	{ name: 'scan upload', handler: uploadScan, method: 'POST', id: 'roster-b' },
	{ name: 'scan unlink', handler: unlinkScan, method: 'DELETE', id: 'roster-b' },
	{ name: 'roster delete', handler: deleteRoster, method: 'DELETE', id: 'roster-b' },
	{
		name: 'privileged roster snapshot',
		handler: createRoster,
		method: 'POST',
		id: '',
		body: { title: 'Roster', personnelIds: ['person-b'] }
	}
];

function expectNoPrivateEffects(f: ReturnType<typeof fixture>, before: Record<string, Row[]>) {
	expect(f.tables.personnel_documents).toEqual(before.personnel_documents);
	expect(f.tables.sign_in_rosters).toEqual(before.sign_in_rosters);
	expect(f.requests.filter((r) => r.path.startsWith('/storage/'))).toEqual([]);
	expect(f.requests.filter((r) => r.method !== 'GET' && !r.path.endsWith('/audit_logs'))).toEqual([]);
}

afterEach(() => vi.restoreAllMocks());

describe('private resource HTTP admission and provider ownership', () => {
	for (const denial of ['anonymous', 'nonmember', 'wrong lane'] as const) {
		it.each(operations)(`denies $name for ${denial} before private provider effects`, async (op) => {
			const f = fixture(
				denial === 'wrong lane'
					? {
							...membership,
							capability_overrides: {
								personnel: 'none',
								training: 'none',
								ratingScheme: 'configure',
								calendar: 'configure'
							}
						}
					: membership
			);
			if (denial === 'anonymous') f.locals.user = null;
			if (denial === 'nonmember') f.tables.organization_memberships[0].organization_id = FOREIGN_ORG;
			const before = structuredClone(f.tables);
			await expect(op.handler(event(f, op.method, op.id, 'doc-b', op.body))).rejects.toMatchObject({
				status: denial === 'anonymous' ? 401 : 403
			});
			expectNoPrivateEffects(f, before);
			expect(f.requests.filter((r) => r.client === 'service' && !r.path.endsWith('/audit_logs'))).toEqual([]);
			if (denial === 'anonymous') expect(f.requests).toEqual([]);
		});
	}

	it.each([
		{
			name: 'document',
			handler: downloadDocument,
			id: 'person-b',
			bucket: 'personnel-documents',
			path: `${ORG}/personnel/person-b/documents/b.pdf`
		},
		{
			name: 'scan',
			handler: downloadScan,
			id: 'roster-b',
			bucket: 'counseling-files',
			path: `${ORG}/sign-in-rosters/roster-b/b.pdf`
		}
	])(
		'signs an allowed $name in the second Group with the caller client for five minutes',
		async ({ handler, id, bucket, path }) => {
			const f = fixture();
			const response = await handler(event(f, 'GET', id));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				url: 'http://caller.invalid/storage/v1/object/sign/synthetic-private-file'
			});
			expect(f.requests.filter((r) => r.path.startsWith('/storage/'))).toEqual([
				{
					client: 'caller',
					path: `/storage/v1/object/sign/${bucket}/${path}`,
					method: 'POST',
					body: { expiresIn: 300 }
				}
			]);
		}
	);

	it.each([
		{ id: 'person-c', documentId: 'doc-c', status: 403 },
		{ id: 'ungrouped', documentId: 'doc-b', status: 403 },
		{ id: 'foreign', documentId: 'foreign-doc', status: 404 },
		{ id: 'person-b', documentId: 'doc-c', status: 404 },
		{ id: 'person-b', documentId: 'foreign-doc', status: 404 }
	])('rejects document $documentId through person $id without signing', async ({ id, documentId, status }) => {
		const f = fixture();
		const before = structuredClone(f.tables);
		await expect(downloadDocument(event(f, 'GET', id, documentId))).rejects.toMatchObject({ status });
		expectNoPrivateEffects(f, before);
	});

	it.each(operations.filter((op) => op.id === 'person-b'))(
		'denies $name outside Group or Organization scope before private effects',
		async (op) => {
			for (const [id, documentId, status] of [
				['person-c', 'doc-c', 403],
				['ungrouped', 'doc-b', 403],
				['foreign', 'foreign-doc', 404]
			] as const) {
				const f = fixture();
				const before = structuredClone(f.tables);
				await expect(op.handler(event(f, op.method, id, documentId, op.body))).rejects.toMatchObject({ status });
				expectNoPrivateEffects(f, before);
			}
		}
	);

	it.each(operations.filter((op) => ['document archive', 'document restore', 'document delete'].includes(op.name)))(
		'rejects $name with another person or Organization document id',
		async (op) => {
			for (const documentId of ['doc-c', 'foreign-doc']) {
				const f = fixture();
				const before = structuredClone(f.tables);
				await expect(op.handler(event(f, op.method, 'person-b', documentId, op.body))).rejects.toMatchObject({
					status: 404
				});
				expectNoPrivateEffects(f, before);
			}
		}
	);

	it.each([listDocuments, downloadDocument])(
		'does not expose sensitive documents to a Personnel operator',
		async (handler) => {
			const f = fixture({ ...membership, capability_overrides: { personnel: 'operate' } });
			const before = structuredClone(f.tables);
			await expect(handler(event(f, 'GET', 'person-b'))).rejects.toMatchObject({ status: 403 });
			expectNoPrivateEffects(f, before);
		}
	);

	it.each(['mixed', 'org-wide', 'foreign-roster'])('denies every private scan effect for %s', async (id) => {
		for (const op of operations.filter((op) => op.id === 'roster-b')) {
			const f = fixture();
			const before = structuredClone(f.tables);
			await expect(op.handler(event(f, op.method, id))).rejects.toMatchObject({ status: 404 });
			expectNoPrivateEffects(f, before);
		}
	});

	it('returns only this person’s document metadata without storage paths', async () => {
		const f = fixture();
		const response = await listDocuments(event(f, 'GET', 'person-b'));
		const rows = await response.json();
		expect(rows.map((row: { id: string }) => row.id)).toEqual(['doc-b']);
		expect(rows[0]).not.toHaveProperty('filePath');
		expect(f.requests.filter((r) => r.path.startsWith('/storage/'))).toEqual([]);
	});

	it.each(['metadata', 'signing'])('does not return a private URL after %s provider failure', async (failure) => {
		const f = fixture();
		f.state.failedTable = failure === 'metadata' ? 'personnel_documents' : '';
		f.state.failSigning = failure === 'signing';
		await expect(downloadDocument(event(f, 'GET', 'person-b'))).rejects.toMatchObject({ status: 500 });
		if (failure === 'metadata') expect(f.requests.filter((r) => r.path.startsWith('/storage/'))).toEqual([]);
	});

	it('uses the narrow privileged Personnel lookup but persists the roster through the caller client', async () => {
		const f = fixture({ ...membership, capability_overrides: { personnel: 'none', training: 'operate' } });
		const response = await createRoster(
			event(f, 'POST', '', '', { title: 'Synthetic roster', personnelIds: ['person-b'] })
		);
		expect(response.status).toBe(200);
		expect((await response.json()).personnelSnapshot).toEqual([
			{ id: 'person-b', rank: 'SGT', firstName: 'Bea', lastName: 'Baker', groupId: 'bravo', group: 'Bravo' }
		]);
		expect(f.requests.filter((r) => r.path.endsWith('/personnel')).map((r) => r.client)).toEqual(['service']);
		expect(f.requests.find((r) => r.path.endsWith('/sign_in_rosters') && r.method === 'POST')?.client).toBe('caller');
		expect(f.tables.sign_in_rosters.at(-1)).toMatchObject({
			organization_id: ORG,
			personnel_ids: ['person-b'],
			scope_group_ids: ['bravo']
		});
	});

	it.each([
		{ id: 'person-c', status: 403 },
		{ id: 'ungrouped', status: 403 },
		{ id: 'foreign', status: 400 }
	])('does not persist or return a privileged snapshot for $id', async ({ id, status }) => {
		const f = fixture();
		const before = structuredClone(f.tables);
		await expect(
			createRoster(event(f, 'POST', '', '', { title: 'Synthetic roster', personnelIds: [id] }))
		).rejects.toMatchObject({ status });
		expectNoPrivateEffects(f, before);
	});
});
