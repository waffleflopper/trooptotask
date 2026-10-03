import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createIdentityPlatformAccessRequestStore } from './platformAccessRequests.server';

const REQUEST = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REVIEWER = '33333333-3333-4333-8333-333333333333';
type Row = Record<string, unknown>;

function makeStore(fetch: typeof globalThis.fetch) {
	return createIdentityPlatformAccessRequestStore(
		createClient('http://127.0.0.1:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch }
		})
	);
}

function request(id = REQUEST): Row {
	return {
		id,
		name: 'Synthetic applicant',
		email: 'applicant@example.test',
		reason: null,
		heard_about: null,
		heard_about_details: null,
		status: 'pending',
		created_at: '2026-06-01T00:00:00Z',
		reviewed_at: null,
		reviewed_by: null,
		setup_completed_at: null
	};
}

function provider(tables: Record<string, Row[]>, fail?: string): typeof globalThis.fetch {
	return async (input, init) => {
		const req = new Request(input, init);
		const url = new URL(req.url);
		const table = url.pathname.split('/').at(-1)!;
		if (table === fail) return Response.json({ message: 'private-provider-detail' }, { status: 500 });
		if (!tables[table]) throw new Error(`Unexpected source ${table}`);
		let rows = [...tables[table]];
		for (const [field, value] of url.searchParams) {
			if (value.startsWith('eq.')) rows = rows.filter((row) => row[field] === value.slice(3));
			if (value.startsWith('in.(')) {
				const ids = value
					.slice(4, -1)
					.split(',')
					.map((id) => id.replaceAll('"', ''));
				rows = rows.filter((row) => ids.includes(`${row[field]}`));
			}
		}
		const order = url.searchParams.get('order')?.split(',') ?? [];
		rows.sort((a, b) => {
			for (const spec of order) {
				const [field, direction] = spec.split('.');
				const compared = String(a[field]).localeCompare(String(b[field]));
				if (compared) return direction === 'desc' ? -compared : compared;
			}
			return 0;
		});
		const offset = Number(url.searchParams.get('offset') ?? 0);
		const limit = Number(url.searchParams.get('limit') ?? rows.length);
		rows = rows.slice(offset, offset + limit);
		const fields = (url.searchParams.get('select') ?? '').split(',').map((field) => field.trim());
		return Response.json(rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]]))));
	};
}

describe('Identity platform Access Request source', () => {
	it('keeps complete setup histories beyond a nested provider cap without selecting credential material', async () => {
		const links = Array.from({ length: 1001 }, (_, index) => ({
			access_request_id: REQUEST,
			id: `link-${index}`,
			created_at: '2026-06-02',
			expires_at: '2026-06-16',
			claimed_at: index === 0 ? '2026-06-02' : null,
			failed_at: null,
			failure_reason: null,
			used_at: null,
			revoked_at: null,
			revocation_reason: null,
			token_hash: 'private-token-hash'
		}));
		const outbox = Array.from({ length: 1001 }, (_, index) => ({
			access_request_id: REQUEST,
			id: `delivery-${index}`,
			setup_link_id: `link-${index}`,
			status: 'sent',
			attempt_count: 1,
			last_error: null,
			created_at: '2026-06-02',
			updated_at: '2026-06-02',
			sent_at: '2026-06-02',
			payload: 'private-email'
		}));
		const store = makeStore(
			provider({ access_requests: [request()], account_setup_links: links, auth_email_outbox: outbox })
		);
		const rows = await store.listAccessRequests();
		expect(rows).toHaveLength(1);
		expect(rows[0].account_setup_links).toHaveLength(1001);
		expect(rows[0].auth_email_outbox).toHaveLength(1001);
		expect(rows[0].account_setup_links).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: 'link-0', claimed_at: '2026-06-02' })])
		);
		expect(JSON.stringify(rows)).not.toMatch(/private-token-hash|private-email|token_hash|payload/);
	});

	it('enumerates tied-date request pages completely and keeps their distinct request identities', async () => {
		const requests = Array.from({ length: 1001 }, (_, index) => request(`request-${String(index).padStart(4, '0')}`));
		const store = makeStore(provider({ access_requests: requests, account_setup_links: [], auth_email_outbox: [] }));
		const rows = await store.listAccessRequests();
		expect(rows).toHaveLength(1001);
		expect(new Set(rows.map((row) => row.id)).size).toBe(1001);
		expect(rows[0].id).toBe('request-1000');
		expect(rows.at(-1)?.id).toBe('request-0000');
	});

	it.each(['access_requests', 'account_setup_links', 'auth_email_outbox'])(
		'keeps %s read failure visible',
		async (failed) => {
			const store = makeStore(
				provider({ access_requests: [request()], account_setup_links: [], auth_email_outbox: [] }, failed)
			);
			await expect(store.listAccessRequests()).rejects.toThrow();
		}
	);

	it('reads commands only from their exact request and required state', async () => {
		const approved = { ...request(OTHER), status: 'approved' };
		const store = makeStore(provider({ access_requests: [request(), approved] }));
		await expect(store.getPendingAccessRequestForApproval(REQUEST)).resolves.toMatchObject({
			id: REQUEST,
			status: 'pending'
		});
		await expect(store.getApprovedAccessRequestForResend(REQUEST)).resolves.toBeNull();
		await expect(store.getApprovedAccessRequestForResend(OTHER)).resolves.toMatchObject({
			id: OTHER,
			status: 'approved'
		});
	});

	it('approves only the still-pending exact request and preserves a terminal competing winner', async () => {
		const rows = [request(), { ...request(OTHER), status: 'rejected', reviewed_by: 'other-reviewer' }];
		const store = makeStore(async (input, init) => {
			const req = new Request(input, init);
			const url = new URL(req.url);
			expect(req.method).toBe('PATCH');
			expect(url.pathname).toBe('/rest/v1/access_requests');
			const id = url.searchParams.get('id')?.slice(3);
			const status = url.searchParams.get('status')?.slice(3);
			const row = rows.find((row) => row.id === id && row.status === status);
			if (row) Object.assign(row, await req.json());
			return Response.json(row ? { id: row.id } : null);
		});
		const command = { accessRequestId: REQUEST, reviewerId: REVIEWER, reviewedAt: new Date('2026-06-03T00:00:00Z') };
		await expect(store.markPendingRequestApproved(command)).resolves.toBe('approved');
		await expect(store.markPendingRequestApproved(command)).resolves.toBe('not_found');
		await expect(store.markPendingRequestApproved({ ...command, accessRequestId: OTHER })).resolves.toBe('not_found');
		expect(rows[0]).toMatchObject({
			status: 'approved',
			reviewed_by: REVIEWER,
			reviewed_at: '2026-06-03T00:00:00.000Z'
		});
		expect(rows[1]).toMatchObject({ status: 'rejected', reviewed_by: 'other-reviewer' });
	});
});
