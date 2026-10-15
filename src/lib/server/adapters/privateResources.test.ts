import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import type { OrganizationMembershipFacts } from '$lib/access/memberAccessProjection';
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
const PERSON_B = '00000000-0000-4000-8000-0000000000b1';
const PERSON_C = '00000000-0000-4000-8000-0000000000c1';
const UNGROUPED_PERSON = '00000000-0000-4000-8000-0000000000d1';
const FOREIGN_PERSON = '00000000-0000-4000-8000-0000000000f1';
const DOC_B = '00000000-0000-4000-8000-0000000000b2';
const DOC_C = '00000000-0000-4000-8000-0000000000c2';
const FOREIGN_DOC = '00000000-0000-4000-8000-0000000000f2';
const ROSTER_B = '00000000-0000-4000-8000-0000000000b3';
const membership: OrganizationMembershipFacts = {
	role: 'member',
	member_preset: 'operator',
	capability_overrides: { personnel: 'configure', training: 'operate' },
	access_scope_kind: 'groups',
	access_scope_group_ids: ['alpha', 'bravo']
};
type Row = Record<string, unknown>;

function fixture(member: OrganizationMembershipFacts = membership) {
	const tables: Record<string, Row[]> = {
		organizations: [{ id: ORG, suspended_at: null }],
		organization_memberships: [{ ...member, user_id: USER, organization_id: ORG }],
		personnel: [
			{
				id: PERSON_B,
				organization_id: ORG,
				group_id: 'bravo',
				first_name: 'Bea',
				last_name: 'Baker',
				rank: 'SGT',
				groups: { name: 'Bravo' }
			},
			{ id: PERSON_C, organization_id: ORG, group_id: 'charlie' },
			{ id: UNGROUPED_PERSON, organization_id: ORG, group_id: null },
			{ id: FOREIGN_PERSON, organization_id: FOREIGN_ORG, group_id: 'bravo' }
		],
		personnel_documents: [
			{
				id: DOC_B,
				organization_id: ORG,
				personnel_id: PERSON_B,
				title: 'Private B',
				file_path: `${ORG}/personnel/${PERSON_B}/documents/b.pdf`,
				uploaded_by: USER,
				archived_at: null
			},
			{
				id: DOC_C,
				organization_id: ORG,
				personnel_id: PERSON_C,
				title: 'Private C',
				file_path: `${ORG}/personnel/${PERSON_C}/documents/c.pdf`
			},
			{
				id: FOREIGN_DOC,
				organization_id: FOREIGN_ORG,
				personnel_id: FOREIGN_PERSON,
				title: 'Foreign secret',
				file_path: `${FOREIGN_ORG}/personnel/${FOREIGN_PERSON}/documents/f.pdf`
			}
		],
		sign_in_rosters: [
			{
				id: ROSTER_B,
				organization_id: ORG,
				scope_group_ids: ['bravo'],
				signed_file_path: `${ORG}/sign-in-rosters/${ROSTER_B}/b.pdf`
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
						return Response.json({
							signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=synthetic-private-token`
						});
					}
					const table = url.pathname.split('/').at(-1)!;
					if (isDeletionReceiptRead({ path: url.pathname, body })) return Response.json([]);
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
	const locals = {
		actor: { userId: USER },
		user: { id: USER },
		session: null,
		supabase: client('caller')
	} as App.Locals;
	return { tables, requests, state, locals };
}

function event(
	f: ReturnType<typeof fixture>,
	method: string,
	id: string,
	documentId = DOC_B,
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
	{ name: 'document list', handler: listDocuments, method: 'GET', id: PERSON_B },
	{ name: 'document download', handler: downloadDocument, method: 'GET', id: PERSON_B },
	{ name: 'document upload', handler: uploadDocument, method: 'POST', id: PERSON_B },
	{ name: 'document archive', handler: changeDocument, method: 'PATCH', id: PERSON_B, body: { action: 'archive' } },
	{ name: 'document restore', handler: changeDocument, method: 'PATCH', id: PERSON_B, body: { action: 'restore' } },
	{ name: 'document delete', handler: deleteDocument, method: 'DELETE', id: PERSON_B },
	{ name: 'scan download', handler: downloadScan, method: 'GET', id: ROSTER_B },
	{ name: 'scan upload', handler: uploadScan, method: 'POST', id: ROSTER_B },
	{
		name: 'scan unlink',
		handler: unlinkScan,
		method: 'DELETE',
		id: ROSTER_B,
		body: { filePath: `${ORG}/sign-in-rosters/${ROSTER_B}/b.pdf` }
	},
	{ name: 'roster delete', handler: deleteRoster, method: 'DELETE', id: ROSTER_B },
	{
		name: 'privileged roster snapshot',
		handler: createRoster,
		method: 'POST',
		id: '',
		body: { title: 'Roster', personnelIds: [PERSON_B] }
	}
];

function isDeletionReceiptRead(request: { path: string; body: unknown }) {
	return (
		request.path.endsWith('/rpc/delete_archived_personnel_artifact') &&
		(request.body as { p_archived_at?: unknown } | undefined)?.p_archived_at === null
	);
}

function expectNoPrivateEffects(f: ReturnType<typeof fixture>, before: Record<string, Row[]>) {
	expect(f.tables.personnel_documents).toEqual(before.personnel_documents);
	expect(f.tables.sign_in_rosters).toEqual(before.sign_in_rosters);
	expect(f.requests.filter((r) => r.path.startsWith('/storage/'))).toEqual([]);
	expect(
		f.requests.filter((r) => r.method !== 'GET' && !r.path.endsWith('/audit_logs') && !isDeletionReceiptRead(r))
	).toEqual([]);
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
			if (denial === 'anonymous') {
				f.locals.user = null;
				f.locals.actor = null;
			}
			if (denial === 'nonmember') f.tables.organization_memberships[0].organization_id = FOREIGN_ORG;
			const before = structuredClone(f.tables);
			await expect(op.handler(event(f, op.method, op.id, DOC_B, op.body))).rejects.toMatchObject({
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
			id: PERSON_B,
			bucket: 'personnel-documents',
			path: `${ORG}/personnel/${PERSON_B}/documents/b.pdf`
		},
		{
			name: 'scan',
			handler: downloadScan,
			id: ROSTER_B,
			bucket: 'counseling-files',
			path: `${ORG}/sign-in-rosters/${ROSTER_B}/b.pdf`
		}
	])(
		'signs an allowed $name in the second Group with the caller client for five minutes',
		async ({ handler, id, bucket, path }) => {
			const f = fixture();
			const response = await handler(event(f, 'GET', id));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({
				url: `http://caller.invalid/storage/v1/object/sign/${bucket}/${path}?token=synthetic-private-token`
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
		{ name: 'doc-c through person person-c', id: PERSON_C, documentId: DOC_C, status: 403 },
		{ name: 'doc-b through person ungrouped', id: UNGROUPED_PERSON, documentId: DOC_B, status: 403 },
		{ name: 'foreign-doc through person foreign', id: FOREIGN_PERSON, documentId: FOREIGN_DOC, status: 404 },
		{ name: 'doc-c through person person-b', id: PERSON_B, documentId: DOC_C, status: 404 },
		{ name: 'foreign-doc through person person-b', id: PERSON_B, documentId: FOREIGN_DOC, status: 404 }
	])('rejects document $name without signing', async ({ id, documentId, status }) => {
		const f = fixture();
		const before = structuredClone(f.tables);
		await expect(downloadDocument(event(f, 'GET', id, documentId))).rejects.toMatchObject({ status });
		expectNoPrivateEffects(f, before);
	});

	it.each(operations.filter((op) => op.id === PERSON_B))(
		'denies $name outside Group or Organization scope before private effects',
		async (op) => {
			for (const [id, documentId, status] of [
				[PERSON_C, DOC_C, 403],
				[UNGROUPED_PERSON, DOC_B, 403],
				[FOREIGN_PERSON, FOREIGN_DOC, 404]
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
			for (const documentId of [DOC_C, FOREIGN_DOC]) {
				const f = fixture();
				const before = structuredClone(f.tables);
				await expect(op.handler(event(f, op.method, PERSON_B, documentId, op.body))).rejects.toMatchObject({
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
			await expect(handler(event(f, 'GET', PERSON_B))).rejects.toMatchObject({ status: 403 });
			expectNoPrivateEffects(f, before);
		}
	);

	it.each(['mixed', 'org-wide', 'foreign-roster'])('denies every private scan effect for %s', async (id) => {
		for (const op of operations.filter((op) => op.id === ROSTER_B)) {
			const f = fixture();
			const before = structuredClone(f.tables);
			await expect(op.handler(event(f, op.method, id, DOC_B, op.body))).rejects.toMatchObject({ status: 404 });
			expectNoPrivateEffects(f, before);
		}
	});

	it('returns only this person’s document metadata without storage paths', async () => {
		const f = fixture();
		const response = await listDocuments(event(f, 'GET', PERSON_B));
		const rows = await response.json();
		expect(rows.map((row: { id: string }) => row.id)).toEqual([DOC_B]);
		expect(rows[0]).not.toHaveProperty('filePath');
		expect(f.requests.filter((r) => r.path.startsWith('/storage/'))).toEqual([]);
	});

	it.each(['metadata', 'signing'])('does not return a private URL after %s provider failure', async (failure) => {
		const f = fixture();
		f.state.failedTable = failure === 'metadata' ? 'personnel_documents' : '';
		f.state.failSigning = failure === 'signing';
		await expect(downloadDocument(event(f, 'GET', PERSON_B))).rejects.toMatchObject({ status: 500 });
		if (failure === 'metadata') expect(f.requests.filter((r) => r.path.startsWith('/storage/'))).toEqual([]);
	});

	it('uses the narrow privileged Personnel lookup but persists the roster through the caller client', async () => {
		const f = fixture({ ...membership, capability_overrides: { personnel: 'none', training: 'operate' } });
		const response = await createRoster(
			event(f, 'POST', '', '', { title: 'Synthetic roster', personnelIds: [PERSON_B] })
		);
		expect(response.status).toBe(200);
		expect((await response.json()).personnelSnapshot).toEqual([
			{ id: PERSON_B, rank: 'SGT', firstName: 'Bea', lastName: 'Baker', groupId: 'bravo', group: 'Bravo' }
		]);
		expect(f.requests.filter((r) => r.path.endsWith('/personnel')).map((r) => r.client)).toEqual(['service']);
		expect(f.requests.find((r) => r.path.endsWith('/sign_in_rosters') && r.method === 'POST')?.client).toBe('caller');
		expect(f.tables.sign_in_rosters.at(-1)).toMatchObject({
			organization_id: ORG,
			personnel_ids: [PERSON_B],
			scope_group_ids: ['bravo']
		});
	});

	it.each([
		{ name: 'person-c', id: PERSON_C, status: 400 },
		{ name: 'ungrouped', id: UNGROUPED_PERSON, status: 400 },
		{ name: 'foreign', id: FOREIGN_PERSON, status: 400 }
	])('does not persist or return a privileged snapshot for $name', async ({ id, status }) => {
		const f = fixture();
		const before = structuredClone(f.tables);
		await expect(
			createRoster(event(f, 'POST', '', '', { title: 'Synthetic roster', personnelIds: [id] }))
		).rejects.toMatchObject({ status });
		expectNoPrivateEffects(f, before);
	});
});
