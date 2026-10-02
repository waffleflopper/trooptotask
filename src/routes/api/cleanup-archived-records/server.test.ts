import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { GET } from './+server';
import { GET as cleanupLegacyPersonnel } from '../cleanup-archived-personnel/+server';
import { GET as cleanupOnboardings } from '../cleanup-expired-onboardings/+server';

const { getAdminClient, env } = vi.hoisted(() => ({
	getAdminClient: vi.fn(),
	env: { CLEANUP_SECRET: 'synthetic-retention-secret', CRON_SECRET: 'synthetic-shared-cron-secret' }
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
vi.mock('$env/dynamic/private', () => ({ env }));

function request(authorization?: string) {
	return {
		request: new Request('https://example.test/api/cleanup-archived-records', {
			headers: authorization ? { authorization } : {}
		})
	} as RequestEvent;
}

describe.each([
	{ name: 'main archive endpoint', run: GET },
	{ name: 'legacy Personnel endpoint', run: cleanupLegacyPersonnel },
	{
		name: 'Onboarding endpoint',
		run: (event: RequestEvent) =>
			cleanupOnboardings({ request: event.request } as Parameters<typeof cleanupOnboardings>[0])
	}
])('$name admission', ({ run }) => {
	beforeEach(() => {
		getAdminClient.mockReset().mockReturnValue(organizationEnumerationProvider(0).client);
	});

	it.each([undefined, 'Bearer incorrect-secret'])('rejects %s before opening the admin client', async (header) => {
		await expect(run(request(header))).rejects.toMatchObject({ status: 401 });
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('allows the configured cron secret to run the empty scoped cleanup', async () => {
		const response = await run(request('Bearer synthetic-retention-secret'));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ deletedCount: 0, orgsAffected: 0 });
	});
});

/** A synthetic REST boundary: the real SDK, cleanup adapters and both feature owners run unchanged. */
function retentionProvider(table: 'leader_notes' | 'personnel_onboardings' | 'personnel') {
	const administrators = Array.from({ length: 1000 }, (_, index) => `admin-${index}`);
	const state = {
		deleted: false,
		lookupFailureFrom: null as number | null,
		insertFailure: false,
		attempts: [] as Record<string, unknown>[][],
		notifications: [] as Record<string, unknown>[]
	};
	const memberships = [
		...administrators.map((user_id) => ({ organization_id: 'org-1', user_id, role: 'admin' })),
		{ organization_id: 'org-1', user_id: 'owner-last', role: 'owner' },
		{ organization_id: 'org-1', user_id: 'ordinary-member', role: 'member' },
		{ organization_id: 'org-2', user_id: 'foreign-owner', role: 'owner' }
	];
	const client = createClient('http://127.0.0.1:9', 'synthetic-service-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const resource = url.pathname.split('/').at(-1);
				const method = init?.method ?? 'GET';
				if (resource === 'organizations' && method === 'GET') {
					return Response.json([{ id: 'org-1', archive_retention_months: 12 }]);
				}
				if (resource === 'organization_memberships' && method === 'GET') {
					const offset = Number(url.searchParams.get('offset') ?? 0);
					if (state.lookupFailureFrom !== null && offset >= state.lookupFailureFrom) {
						return Response.json({ code: '42501', message: 'administrator lookup unavailable' }, { status: 403 });
					}
					const roleFilter = url.searchParams.get('role');
					const roles = roleFilter?.slice(4, -1).split(',') ?? [];
					const rows = memberships.filter(
						(row) =>
							(!url.searchParams.has('organization_id') ||
								url.searchParams.get('organization_id') === `eq.${row.organization_id}`) &&
							(!roleFilter || roles.includes(row.role))
					);
					const limit = Number(url.searchParams.get('limit') ?? 1000);
					return Response.json(rows.slice(offset, offset + Math.min(limit, 1000)).map(({ user_id }) => ({ user_id })));
				}
				if (resource === 'notifications' && method === 'POST') {
					const rows = JSON.parse(String(init?.body)) as Record<string, unknown>[];
					state.attempts.push(rows);
					if (state.insertFailure) {
						return Response.json({ code: '42501', message: 'notification insert unavailable' }, { status: 403 });
					}
					state.notifications.push(...rows);
					return new Response(null, { status: 201 });
				}
				if (resource === 'delete_expired_personnel' && method === 'POST' && table === 'personnel') {
					const args = JSON.parse(String(init?.body)) as { p_org_id: string; p_candidate_ids: string[] };
					if (args.p_org_id !== 'org-1' || !args.p_candidate_ids.includes('expired'))
						throw new Error('Parent deletion is outside the requested Organization');
					state.deleted = true;
					return Response.json(1);
				}
				if (resource === table) {
					const scoped = url.searchParams.get('organization_id') === 'eq.org-1';
					if (method === 'DELETE' && scoped && url.searchParams.get('id') === 'in.(expired)') {
						state.deleted = true;
						return Response.json([{ id: 'expired' }]);
					}
					if (method === 'GET') {
						return Response.json(
							state.deleted || !scoped || url.searchParams.get('status') === 'eq.cancelled'
								? []
								: [{ id: 'expired', status: 'completed', archived_at: '2000-01-01', completed_at: '2000-01-01' }]
						);
					}
				}
				if (resource === 'onboarding_step_progress' && method === 'DELETE') {
					return new Response(null, { status: 204 });
				}
				if (method === 'GET') return Response.json([]);
				throw new Error(`Unexpected synthetic provider request: ${method} ${resource}`);
			}
		}
	});
	return { client, state, expectedRecipients: [...administrators, 'owner-last'] };
}

describe.each([
	{
		job: 'archive',
		run: (request: Request) => GET({ request } as Parameters<typeof GET>[0]),
		table: 'leader_notes',
		type: 'archive_auto_deleted'
	},
	{
		job: 'onboarding',
		run: (request: Request) => cleanupOnboardings({ request } as Parameters<typeof cleanupOnboardings>[0]),
		table: 'personnel_onboardings',
		type: 'onboarding_auto_deleted'
	}
] as const)('scheduled $job cleanup delivery', ({ run, table, type }) => {
	it('delivers its summary to every current scoped owner/admin beyond one provider page', async () => {
		const provider = retentionProvider(table);
		getAdminClient.mockReturnValue(provider.client);

		const response = await run(request('Bearer synthetic-retention-secret').request);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ deletedCount: 1, orgsAffected: 1 });
		expect(provider.state.deleted).toBe(true);
		expect(provider.state.notifications.map(({ user_id }) => user_id)).toEqual(provider.expectedRecipients);
		expect(provider.state.notifications).toEqual(
			provider.expectedRecipients.map((user_id) =>
				expect.objectContaining({ organization_id: 'org-1', user_id, type, link: null })
			)
		);
	});

	it.each(['lookup', 'insert'] as const)(
		'propagates returned %s errors after deletion without reporting job success',
		async (failure) => {
			const provider = retentionProvider(table);
			// The late lookup failure must discard recipients from the successful first page.
			provider.state.lookupFailureFrom = failure === 'lookup' ? 1000 : null;
			provider.state.insertFailure = failure === 'insert';
			getAdminClient.mockReturnValue(provider.client);

			await expect(run(request('Bearer synthetic-retention-secret').request)).rejects.toThrow(
				failure === 'lookup' ? 'administrator lookup unavailable' : 'notification insert unavailable'
			);

			expect(provider.state.deleted).toBe(true);
			expect(provider.state.notifications).toEqual([]);
			expect(provider.state.attempts).toHaveLength(failure === 'lookup' ? 0 : 1);
		}
	);
});

describe.each([
	{ name: 'main archive endpoint', run: GET },
	{ name: 'legacy Personnel endpoint', run: cleanupLegacyPersonnel }
])('$name Personnel source delivery', ({ run }) => {
	it('deletes through the owned parent source and delivers its count-only summary', async () => {
		const provider = retentionProvider('personnel');
		getAdminClient.mockReturnValue(provider.client);

		const response = await run(request('Bearer synthetic-retention-secret'));

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			deletedCount: 1,
			families: expect.arrayContaining([expect.objectContaining({ key: 'personnel', deletedCount: 1 })])
		});
		expect(provider.state.deleted).toBe(true);
		expect(provider.state.notifications.map(({ user_id }) => user_id)).toEqual(provider.expectedRecipients);
		expect(provider.state.notifications.every(({ message }) => String(message).includes('Personnel: 1'))).toBe(true);
	});
});

// Actual SDK, handlers and downstream discovery adapters. Empty resource cohorts
// isolate complete Organization dispatch from each owner's deletion behavior.
const discoveryTables = new Set([
	'personnel_follow_ups',
	'counseling_records',
	'personnel_documents',
	'leader_notes',
	'personnel',
	'ict_tasks',
	'assignment_types',
	'personnel_onboardings'
]);
function organizationFixture(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
		archive_retention_months: index === 0 ? null : index === 1 ? 0 : 12,
		// The tail is deliberately suspended. Current maintenance enumerates all
		// Organizations; suspension must not remove its retention dispatch.
		suspended_at: index === count - 1 ? '2020-01-01T00:00:00.000Z' : null
	}));
}

function organizationEnumerationProvider(count: number) {
	const organizations = organizationFixture(count);
	const expectedIds = new Set(organizations.map(({ id }) => id));
	let reached!: () => void;
	let release!: () => void;
	const pageReached = new Promise<void>((resolve) => {
		reached = resolve;
	});
	const pageRelease = new Promise<void>((resolve) => {
		release = resolve;
	});
	const state = {
		failFrom: null as number | null,
		holdFrom: null as number | null,
		organizationReads: [] as Array<Record<string, unknown>>,
		resourceReads: [] as Array<{ table: string; organizationId: string; query: string }>,
		unexpectedEffects: [] as Array<{ method: string; path: string }>
	};
	const client = createClient('http://127.0.0.1:9', 'synthetic-service-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const table = url.pathname.split('/').at(-1)!;
				const method = init?.method ?? 'GET';
				if (method !== 'GET' || !url.pathname.startsWith('/rest/v1/')) {
					state.unexpectedEffects.push({ method, path: url.pathname });
					throw new Error('Empty discovery fixture must not mutate rows or invoke Storage');
				}
				if (table === 'organizations') {
					const offset = Number(url.searchParams.get('offset') ?? 0);
					if (state.failFrom !== null && offset >= state.failFrom)
						return Response.json({ message: 'Organization settings unavailable', code: '42501' }, { status: 403 });
					if (state.holdFrom !== null && offset >= state.holdFrom) {
						reached();
						await pageRelease;
					}
					const limit = Number(url.searchParams.get('limit') ?? 1000);
					const fields = (url.searchParams.get('select') ?? '*').split(',');
					const ordered =
						url.searchParams.get('order') === 'id.asc'
							? [...organizations].sort((left, right) => left.id.localeCompare(right.id))
							: organizations;
					const page = ordered.slice(offset, offset + Math.min(limit, 1000));
					state.organizationReads.push({ query: url.search, offset, limit, returnedCount: page.length });
					return Response.json(
						page.map((row) =>
							fields[0] === '*'
								? row
								: Object.fromEntries(fields.map((field) => [field, row[field as keyof typeof row]]))
						)
					);
				}
				if (!discoveryTables.has(table)) throw new Error(`Unexpected discovery table: ${table}`);
				const organizationId = url.searchParams.get('organization_id')?.replace(/^eq\./, '');
				if (!organizationId || !expectedIds.has(organizationId)) {
					throw new Error('Resource discovery must target a known Organization');
				}
				state.resourceReads.push({ table, organizationId, query: url.search });
				return Response.json([]);
			}
		}
	});
	return { client, organizations, state, pageReached, release };
}

describe.each([
	{ label: 'records', run: (input: Request) => GET({ request: input } as Parameters<typeof GET>[0]) },
	{
		label: 'onboarding',
		run: (input: Request) => cleanupOnboardings({ request: input } as Parameters<typeof cleanupOnboardings>[0])
	}
])('$label complete Organization settings dispatch', ({ run }) => {
	it.each([0, 1000, 1001])('discovers resources for every one of %s Organizations', async (count) => {
		const provider = organizationEnumerationProvider(count);
		getAdminClient.mockReturnValue(provider.client);
		const response = await run(request('Bearer synthetic-retention-secret').request);
		const dispatched = new Set(provider.state.resourceReads.map(({ organizationId }) => organizationId));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ deletedCount: 0, orgsAffected: 0 });
		expect(provider.organizations.filter(({ id }) => !dispatched.has(id)).map(({ id }) => id)).toEqual([]);
		expect(provider.state.unexpectedEffects).toEqual([]);
	});

	it.each([0, 1000])('fails Organization settings page %s before any resource effects', async (offset) => {
		const provider = organizationEnumerationProvider(1001);
		provider.state.failFrom = offset;
		getAdminClient.mockReturnValue(provider.client);
		await expect(run(request('Bearer synthetic-retention-secret').request)).rejects.toMatchObject({
			status: 500
		});
		expect(provider.state.resourceReads).toEqual([]);
		expect(provider.state.unexpectedEffects).toEqual([]);
	});

	it('waits for the last settings page before resource discovery begins', async () => {
		const provider = organizationEnumerationProvider(1001);
		provider.state.holdFrom = 1000;
		getAdminClient.mockReturnValue(provider.client);
		const pending = run(request('Bearer synthetic-retention-secret').request);
		await provider.pageReached;
		expect(provider.state.resourceReads).toEqual([]);
		provider.release();
		expect((await pending).status).toBe(200);
		const dispatched = new Set(provider.state.resourceReads.map(({ organizationId }) => organizationId));
		expect(provider.organizations.filter(({ id }) => !dispatched.has(id)).map(({ id }) => id)).toEqual([]);
	});
});
