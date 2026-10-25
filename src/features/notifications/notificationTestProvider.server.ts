import { createClient } from '@supabase/supabase-js';
import type { Notification } from './contracts';

/** Synthetic PostgREST transport. It filters stored rows from the actual SDK request. */
export function notificationTestProvider(rows: Notification[] = [], actingUserId?: string) {
	const state = {
		rows: structuredClone(rows),
		attempts: [] as Array<Record<string, unknown>[]>,
		failure: null as { method: string; message: string } | null
	};
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.pathname !== '/rest/v1/notifications') throw new Error(`Unexpected table: ${url.pathname}`);
				if (request.method === 'POST') {
					const input = (await request.json()) as Record<string, unknown>[];
					state.attempts.push(input);
					if (state.failure?.method !== 'POST') {
						state.rows.push(
							...input.map(
								(row, index) =>
									({
										id: `insert-${state.rows.length + index}`,
										read: false,
										created_at: '2026-09-30T12:00:00Z',
										...row
									}) as Notification
							)
						);
					}
				}
				if (state.failure?.method === request.method) {
					return Response.json({ code: '42501', message: state.failure.message }, { status: 403 });
				}
				const matches = (row: Notification) => {
					if (actingUserId && row.user_id !== actingUserId) return false;
					const alternatives = url.searchParams.get('or');
					if (
						alternatives &&
						row.organization_id !== null &&
						!alternatives.includes(`organization_id.eq.${row.organization_id},`)
					)
						return false;
					for (const column of ['organization_id', 'user_id', 'id', 'read'] as const) {
						const value = url.searchParams.get(column);
						if (value && value !== `eq.${String(row[column])}`) return false;
					}
					return true;
				};
				let selected = state.rows.filter(matches);
				if (request.method === 'PATCH') {
					const changes = (await request.json()) as Partial<Notification>;
					selected.forEach((row) => Object.assign(row, changes));
				}
				if (request.method === 'DELETE') {
					state.rows = state.rows.filter((row) => !matches(row));
					return new Response(null, { status: 204 });
				}
				if (request.method === 'POST') return new Response(null, { status: 201 });
				if (request.method === 'HEAD') {
					return new Response(null, { headers: { 'content-range': `0-0/${selected.length}` } });
				}
				if (url.searchParams.get('order') === 'created_at.desc') {
					selected = [...selected].sort((a, b) => b.created_at.localeCompare(a.created_at));
				}
				const offset = Number(url.searchParams.get('offset') ?? 0);
				const limit = Number(url.searchParams.get('limit') ?? 1000);
				selected = selected.slice(offset, offset + limit);
				const select = url.searchParams.get('select');
				const projected = selected.map((row) =>
					select && select !== '*'
						? Object.fromEntries(select.split(',').map((column) => [column, row[column as keyof Notification]]))
						: row
				);
				if (request.headers.get('accept')?.includes('vnd.pgrst.object')) {
					if (projected.length !== 1) return Response.json({ code: 'PGRST116', message: 'No rows' }, { status: 406 });
					return Response.json(projected[0]);
				}
				return Response.json(projected);
			}
		}
	});
	return { client, state };
}

export function savedNotification(id: string, overrides: Partial<Notification> = {}): Notification {
	return {
		id,
		user_id: 'own-user',
		organization_id: 'org-a',
		type: 'verification',
		title: `Notification ${id}`,
		message: 'Retained content',
		link: null,
		read: false,
		created_at: '2026-09-30T10:00:00Z',
		...overrides
	};
}
