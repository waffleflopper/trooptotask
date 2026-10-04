import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createUserWritePortsContext } from '$lib/server/adapters/inMemory';
import {
	loadGettingStartedDismissed,
	loadUserOrgPreferences,
	patchUserOrgPreferences,
	setGettingStartedDismissed
} from './accountPreferences.server';

interface SavedRow {
	id: string;
	user_id: string;
	organization_id: string;
	preferences?: unknown;
	dismissed_at?: string | null;
	created_at: string;
}

// A synthetic PostgREST transport filters independent saved rows from actual SDK requests.
// It does not establish RLS; the ordinary-role SQL and live HTTP contracts own that proof.
function provider(rows: SavedRow[] = []) {
	const state = {
		rows: structuredClone(rows),
		methods: [] as string[],
		failure: null as string | null,
		acknowledgment: undefined as unknown,
		readAcknowledgment: undefined as unknown
	};
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (!['/rest/v1/user_org_preferences', '/rest/v1/getting_started_progress'].includes(url.pathname))
					throw new Error(`Unexpected endpoint: ${url.pathname}`);
				state.methods.push(request.method);
				if (state.failure === request.method)
					return Response.json({ code: '42501', message: 'private provider failure' }, { status: 403 });
				let selected = state.rows.filter((row) =>
					['user_id', 'organization_id'].every((column) => {
						const filter = url.searchParams.get(column);
						return !filter || filter === `eq.${row[column as keyof SavedRow]}`;
					})
				);
				if (request.method === 'POST') {
					const patch = (await request.json()) as Partial<SavedRow>;
					const row = state.rows.find(
						(row) => row.user_id === patch.user_id && row.organization_id === patch.organization_id
					);
					if (row) Object.assign(row, patch);
					else state.rows.push({ id: 'new-row', created_at: '2026-01-01T00:00:00Z', ...patch } as SavedRow);
					selected = state.rows.filter(
						(row) => row.user_id === patch.user_id && row.organization_id === patch.organization_id
					);
				}
				if (request.method === 'PATCH') {
					const patch = (await request.json()) as Partial<SavedRow>;
					selected.forEach((row) => Object.assign(row, patch));
				}
				if (request.method === 'GET' && state.readAcknowledgment !== undefined)
					return Response.json(state.readAcknowledgment);
				if (request.method !== 'GET' && state.acknowledgment !== undefined) return Response.json(state.acknowledgment);
				if (request.headers.get('accept')?.includes('vnd.pgrst.object')) {
					if (selected.length !== 1) return Response.json({ code: 'PGRST116', message: 'No row' }, { status: 406 });
					return Response.json(selected[0]);
				}
				return Response.json(selected);
			}
		}
	});
	return { supabase, state };
}

function row(overrides: Partial<SavedRow> = {}): SavedRow {
	return {
		id: 'saved-row',
		organization_id: 'test-org',
		user_id: 'test-user',
		created_at: '2025-01-01T00:00:00Z',
		...overrides
	};
}
function writer(supabase: SupabaseClient) {
	const ctx = createUserWritePortsContext();
	return { supabase, auth: ctx.auth, audit: { log: vi.fn() } };
}
const scope = { userId: 'test-user', orgId: 'test-org' };
const defaults = {
	calendar: { showStatusText: false, showPersonnelRoles: false, highlightOnboarding: true },
	training: { selectedGroupId: null, selectedViewId: null, matrixViewMode: 'by-group' }
};

describe('Identity account/Organization preferences', () => {
	it('distinguishes confirmed absence, normalized legacy choices and unavailable reads', async () => {
		const absent = provider();
		await expect(loadUserOrgPreferences(absent, scope)).resolves.toEqual(defaults);
		const legacy = provider([row({ preferences: { calendar: { showStatusText: true, dutyStartDayOnly: false } } })]);
		await expect(loadUserOrgPreferences(legacy, scope)).resolves.toEqual({
			...defaults,
			calendar: { ...defaults.calendar, showStatusText: true }
		});
		legacy.state.failure = 'GET';
		await expect(loadUserOrgPreferences(legacy, scope)).rejects.toThrow('Unable to load');
		await expect(
			patchUserOrgPreferences(writer(legacy.supabase), { training: { selectedGroupId: 'new' } })
		).rejects.toThrow('Unable to load');
		expect(legacy.state.methods).not.toContain('POST');
		expect(legacy.state.rows[0].preferences).toEqual({ calendar: { showStatusText: true, dutyStartDayOnly: false } });
	});

	it('rejects a bound provider row with omitted preferences before dispatching any save', async () => {
		const saved = row({
			preferences: { calendar: { showStatusText: true }, training: { selectedViewId: 'retained-view' } }
		});
		const p = provider([saved]);
		p.state.readAcknowledgment = [{ user_id: scope.userId, organization_id: scope.orgId }];
		const ports = writer(p.supabase);
		await expect(loadUserOrgPreferences(p, scope)).rejects.toThrow('Invalid preference response');
		await expect(patchUserOrgPreferences(ports, { training: { selectedGroupId: 'new-group' } })).rejects.toThrow(
			'Invalid preference response'
		);
		expect(p.state.methods).not.toContain('POST');
		expect(p.state.rows).toEqual([saved]);
		expect(ports.audit.log).not.toHaveBeenCalled();
	});

	it('inserts personal defaults once, then preserves identity and unrelated fields on partial saves', async () => {
		const p = provider([
			row({ user_id: 'peer', preferences: { secret: 'peer' } }),
			row({ organization_id: 'other-org', preferences: { secret: 'foreign' } })
		]);
		const ports = writer(p.supabase);
		await patchUserOrgPreferences(ports, {
			calendar: { showStatusText: true },
			user_id: 'peer',
			organization_id: 'other-org'
		});
		await patchUserOrgPreferences(ports, {
			training: { selectedGroupId: 'group-1', selectedViewId: 'view-1', matrixViewMode: 'alphabetical' }
		});
		await patchUserOrgPreferences(ports, { calendar: { showPersonnelRoles: true } });
		const saved = p.state.rows.find((row) => row.user_id === scope.userId && row.organization_id === scope.orgId);
		expect(saved).toEqual(
			row({
				id: 'new-row',
				created_at: '2026-01-01T00:00:00Z',
				preferences: {
					calendar: { showStatusText: true, showPersonnelRoles: true, highlightOnboarding: true },
					training: { selectedGroupId: 'group-1', selectedViewId: 'view-1', matrixViewMode: 'alphabetical' }
				}
			})
		);
		expect(p.state.rows.slice(0, 2)).toEqual([
			row({ user_id: 'peer', preferences: { secret: 'peer' } }),
			row({ organization_id: 'other-org', preferences: { secret: 'foreign' } })
		]);
		expect(p.state.rows).toHaveLength(3);
		expect(ports.audit.log).toHaveBeenCalledTimes(3);
	});

	it('rejects invalid input and anonymous self actions before persistence', async () => {
		const p = provider();
		const ports = writer(p.supabase);
		await expect(patchUserOrgPreferences(ports, { calendar: { showStatusText: 'yes' } })).rejects.toMatchObject({
			status: 400
		});
		const anonymous = { ...ports, auth: { ...ports.auth, userId: '' } };
		await expect(patchUserOrgPreferences(anonymous, {})).rejects.toMatchObject({ status: 401 });
		await expect(setGettingStartedDismissed(anonymous, true)).rejects.toMatchObject({ status: 401 });
		expect(p.state.methods).toEqual([]);
	});

	it.each([
		null,
		[],
		{},
		row({ user_id: 'peer', preferences: defaults }),
		row({ organization_id: 'foreign', preferences: defaults }),
		row({ preferences: {} }),
		row({ preferences: { ...defaults, calendar: { ...defaults.calendar, showStatusText: true } } })
	])(
		'rejects missing, unbound or mismatched write acknowledgment without a success audit: %j',
		async (acknowledgment) => {
			const p = provider();
			p.state.acknowledgment = acknowledgment;
			const ports = writer(p.supabase);
			await expect(patchUserOrgPreferences(ports, {})).rejects.toThrow();
			expect(ports.audit.log).not.toHaveBeenCalled();
		}
	);

	it('leaves a failed save visible and preserves stored choices through an explicit retry', async () => {
		const p = provider([row({ preferences: defaults })]);
		const ports = writer(p.supabase);
		p.state.failure = 'POST';
		await expect(patchUserOrgPreferences(ports, { training: { selectedViewId: 'view-2' } })).rejects.toThrow(
			'Unable to confirm'
		);
		expect(p.state.rows[0].preferences).toEqual(defaults);
		expect(ports.audit.log).not.toHaveBeenCalled();
		p.state.failure = null;
		await expect(patchUserOrgPreferences(ports, { training: { selectedViewId: 'view-2' } })).resolves.toMatchObject({
			training: { selectedViewId: 'view-2' }
		});
	});
});

describe('Identity Getting Started progress', () => {
	it('confirms absence without writing, dismisses once and resets the saved self row while preserving peers/history', async () => {
		const sentinels = [
			row({ user_id: 'peer', dismissed_at: null }),
			row({ organization_id: 'foreign', dismissed_at: '2025-01-01T00:00:00Z' })
		];
		const p = provider(sentinels);
		const ports = writer(p.supabase);
		await expect(loadGettingStartedDismissed(p, scope)).resolves.toBe(false);
		await setGettingStartedDismissed(ports, false);
		expect(p.state.rows).toEqual(sentinels);
		await setGettingStartedDismissed(ports, true);
		await expect(loadGettingStartedDismissed(p, scope)).resolves.toBe(true);
		const saved = structuredClone(p.state.rows[2]);
		await setGettingStartedDismissed(ports, false);
		await expect(loadGettingStartedDismissed(p, scope)).resolves.toBe(false);
		expect(p.state.rows[2]).toEqual({ ...saved, dismissed_at: null });
		expect(p.state.rows.slice(0, 2)).toEqual(sentinels);
	});

	it('does not treat failed reads or unconfirmed writes as absence or success', async () => {
		const p = provider([row({ dismissed_at: null })]);
		const ports = writer(p.supabase);
		p.state.failure = 'GET';
		await expect(loadGettingStartedDismissed(p, scope)).rejects.toThrow('Unable to load');
		await expect(setGettingStartedDismissed(ports, false)).rejects.toThrow('Unable to load');
		p.state.failure = 'POST';
		await expect(setGettingStartedDismissed(ports, true)).rejects.toThrow('Unable to confirm');
		expect(p.state.rows[0].dismissed_at).toBeNull();
		p.state.failure = null;
		p.state.acknowledgment = [];
		await expect(setGettingStartedDismissed(ports, true)).rejects.toThrow();
		p.state.acknowledgment = row({ user_id: 'peer', dismissed_at: null });
		await expect(setGettingStartedDismissed(ports, false)).rejects.toThrow('Unable to confirm');
	});
});
