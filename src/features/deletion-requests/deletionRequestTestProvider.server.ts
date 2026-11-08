import { createClient } from '@supabase/supabase-js';
import type { DeletionRequest } from './contracts';

export function savedRequest(id: string, overrides: Partial<DeletionRequest> = {}): DeletionRequest {
	return {
		id,
		organization_id: 'org-a',
		requested_by: 'requester-a',
		requested_by_email: 'saved@example.test',
		resource_type: 'training_type',
		resource_id: `type-${id}`,
		resource_description: 'Saved description',
		resource_url: '/org/saved/training',
		status: 'pending',
		reviewed_by: null,
		reviewed_at: null,
		denial_reason: null,
		created_at: '2026-10-01T10:00:00.123456Z',
		...overrides
	};
}

/**
 * Synthetic transport exercises actual SDK filters/projection. SQL tests own real RLS and lock waits.
 * `deny_deletion_request` models the database function's outcome: it names `actingUserId` as the reviewer.
 */
export function deletionRequestTestProvider(rows: DeletionRequest[] = [], actingUserId?: string) {
	const state = {
		rows: structuredClone(rows),
		calls: [] as Request[],
		failure: null as { method: string; message: string; offset?: number } | null,
		rpcReply: undefined as unknown,
		beforeRpc: null as (() => void) | null
	};
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				state.calls.push(request.clone());
				const url = new URL(request.url);
				const denyRpc = url.pathname === '/rest/v1/rpc/deny_deletion_request';
				if (!denyRpc && url.pathname !== '/rest/v1/deletion_requests')
					throw new Error(`Unexpected path ${url.pathname}`);
				if (
					state.failure?.method === request.method &&
					(state.failure.offset === undefined || state.failure.offset === Number(url.searchParams.get('offset') ?? 0))
				) {
					return Response.json({ code: 'XX000', message: state.failure.message }, { status: 500 });
				}
				if (denyRpc) {
					if (request.method !== 'POST') throw new Error(`Unexpected ${request.method} ${url.pathname}`);
					if (state.rpcReply !== undefined) return Response.json(state.rpcReply);
					const args = await request.json();
					state.beforeRpc?.();
					const row = state.rows.find(
						(candidate) =>
							candidate.organization_id === args.p_organization_id &&
							candidate.id === args.p_request_id &&
							candidate.resource_type === args.p_resource_type &&
							candidate.resource_id === args.p_resource_id &&
							candidate.status === 'pending'
					);
					if (!row) return Response.json(false);
					Object.assign(row, {
						status: 'denied',
						reviewed_by: actingUserId ?? 'synthetic-reviewer',
						reviewed_at: '2026-10-02T12:00:00.000Z',
						denial_reason: args.p_denial_reason ?? null
					});
					return Response.json(true);
				}
				if (request.method === 'POST') {
					const input = await request.json();
					const row = savedRequest(`insert-${state.rows.length}`, input);
					state.rows.push(row);
					return Response.json(row, { status: 201 });
				}
				let selected = state.rows.filter((row) => {
					if (actingUserId && row.requested_by !== actingUserId) return false;
					for (const column of [
						'organization_id',
						'id',
						'status',
						'requested_by',
						'resource_type',
						'resource_id'
					] as const) {
						const filter = url.searchParams.get(column);
						if (!filter) continue;
						const negated = filter.startsWith('neq.');
						if (negated ? filter === `neq.${row[column]}` : filter !== `eq.${row[column]}`) return false;
					}
					return true;
				});
				const count = selected.length;
				const orders = (url.searchParams.get('order') ?? '').split(',').filter(Boolean);
				selected = [...selected].sort((a, b) => {
					for (const order of orders) {
						const [key, direction] = order.split('.') as [keyof DeletionRequest, string];
						const result = String(a[key]).localeCompare(String(b[key]));
						if (result) return direction === 'desc' ? -result : result;
					}
					return 0;
				});
				const offset = Number(url.searchParams.get('offset') ?? 0);
				const limit = Number(url.searchParams.get('limit') ?? 1000);
				selected = selected.slice(offset, offset + limit);
				const select = url.searchParams.get('select');
				const projected = selected.map((row) =>
					select && select !== '*'
						? Object.fromEntries(select.split(',').map((key) => [key, row[key as keyof DeletionRequest]]))
						: row
				);
				const headers = request.headers.get('prefer')?.includes('count=exact')
					? { 'content-range': `${offset}-${offset + projected.length - 1}/${count}` }
					: undefined;
				if (request.headers.get('accept')?.includes('vnd.pgrst.object')) {
					if (projected.length !== 1)
						return Response.json(
							{ code: 'PGRST116', message: 'No matching row', details: 'The result contains 0 rows' },
							{ status: 406 }
						);
					return Response.json(projected[0], { headers });
				}
				return Response.json(projected, { headers });
			}
		}
	});
	return { client, state };
}
