import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createWriteWithNotificationsPortsContext } from '$lib/server/adapters/inMemory';
import { createSupabaseDeletionRequestCancellation } from './cancellationProvider.server';
import { cancelDeletionRequest } from './cancelDeletionRequest.server';

const ORG = 'd1801000-0000-4000-8000-000000000101';
const REQUEST = 'd1801000-0000-4000-8000-000000000201';
const USER = 'd1801000-0000-4000-8000-000000000001';

function fixture() {
	const ctx = createWriteWithNotificationsPortsContext({
		auth: {
			userId: USER,
			orgId: ORG,
			role: 'member',
			isPrivileged: false,
			capabilityMap: {
				personnel: 'none',
				training: 'none',
				ratingScheme: 'none',
				calendar: 'none',
				criticalTasks: 'none',
				onboarding: 'none'
			}
		}
	});
	const request = {
		id: REQUEST,
		organization_id: ORG,
		requested_by: USER,
		requested_by_email: 'requester@example.test',
		resource_type: 'personnel',
		resource_id: 'person-a',
		resource_description: 'Retained archival request',
		resource_url: '/org/a/personnel',
		status: 'pending',
		created_at: '2030-01-01T00:00:00Z',
		reviewed_by: null,
		reviewed_at: null,
		denial_reason: null
	};
	ctx.store.seed('deletion_requests', [request]);
	ctx.store.seed('personnel', [{ id: 'person-a', organization_id: ORG, archived_at: null }]);
	const state = { response: undefined as Response | undefined };
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const call = new Request(input, init);
				if (call.method !== 'POST' || new URL(call.url).pathname !== '/rest/v1/rpc/cancel_own_deletion_request') {
					throw new Error('Unexpected provider operation');
				}
				const body = await call.json();
				// This fake accepts only the independently specified Organization/request command.
				if (Object.keys(body).sort().join(',') !== 'p_organization_id,p_request_id') {
					throw new Error('Cancellation must not accept an actor or arbitrary patch');
				}
				if (state.response) return state.response;
				const saved = await ctx.store.findOne('deletion_requests', body.p_organization_id, {
					id: body.p_request_id,
					requested_by: USER,
					status: 'pending'
				});
				if (!saved) return Response.json({ code: 'P0002', message: 'Unavailable pending request' }, { status: 404 });
				await ctx.store.update('deletion_requests', body.p_organization_id, body.p_request_id, { status: 'cancelled' });
				return Response.json(true);
			}
		}
	});
	return { ...ctx, cancellation: createSupabaseDeletionRequestCancellation(client), state, request };
}

describe('owned deletion request cancellation', () => {
	it('cancels without source capability, retains history and source, and rejects a terminal replay', async () => {
		const ctx = fixture();
		await cancelDeletionRequest(ctx, REQUEST);
		expect(await ctx.store.findOne('deletion_requests', ORG, { id: REQUEST })).toEqual({
			...ctx.request,
			status: 'cancelled'
		});
		expect(await ctx.store.findOne('personnel', ORG, { id: 'person-a' })).toEqual({
			id: 'person-a',
			organization_id: ORG,
			archived_at: null
		});
		expect(ctx.audit.events).toEqual([
			{
				action: 'deletion_request.cancelled',
				resourceType: 'deletion_request',
				resourceId: REQUEST
			}
		]);
		await expect(cancelDeletionRequest(ctx, REQUEST)).rejects.toMatchObject({ status: 404 });
		expect(ctx.audit.events).toHaveLength(1);
	});

	it('rejects another requester and foreign or missing requests without changing them', async () => {
		const ctx = fixture();
		await expect(
			cancelDeletionRequest({ ...ctx, auth: { ...ctx.auth, userId: 'another-user' } }, REQUEST)
		).rejects.toMatchObject({ status: 403 });
		await expect(
			cancelDeletionRequest({ ...ctx, auth: { ...ctx.auth, orgId: 'foreign-org' } }, REQUEST)
		).rejects.toMatchObject({ status: 404 });
		await expect(cancelDeletionRequest(ctx, 'missing')).rejects.toMatchObject({ status: 404 });
		expect(await ctx.store.findOne('deletion_requests', ORG, { id: REQUEST })).toEqual(ctx.request);
		expect(ctx.audit.events.some((event) => event.action === 'deletion_request.cancelled')).toBe(false);
	});

	it.each([
		{ code: 'P0002', status: 404 },
		{ code: '42501', status: 403 },
		{ code: 'P0001', status: undefined }
	])(
		'propagates $code after preflight without success audit and allows an explicit retry',
		async ({ code, status }) => {
			const ctx = fixture();
			ctx.state.response = Response.json({ code, message: 'Synthetic cancellation fault' }, { status: 400 });
			if (status) await expect(cancelDeletionRequest(ctx, REQUEST)).rejects.toMatchObject({ status });
			else await expect(cancelDeletionRequest(ctx, REQUEST)).rejects.toThrow('Synthetic cancellation fault');
			expect(await ctx.store.findOne('deletion_requests', ORG, { id: REQUEST })).toEqual(ctx.request);
			expect(ctx.audit.events).toEqual([]);
			ctx.state.response = undefined;
			await cancelDeletionRequest(ctx, REQUEST);
			expect(await ctx.store.findOne('deletion_requests', ORG, { id: REQUEST })).toMatchObject({ status: 'cancelled' });
			expect(ctx.audit.events).toHaveLength(1);
		}
	);

	it.each([null, false, 'true', { success: true }])(
		'requires an affirmative provider acknowledgement (%j)',
		async (reply) => {
			const ctx = fixture();
			ctx.state.response = Response.json(reply);
			await expect(cancelDeletionRequest(ctx, REQUEST)).rejects.toThrow('not acknowledged');
			expect(ctx.audit.events).toEqual([]);
			expect(await ctx.store.findOne('deletion_requests', ORG, { id: REQUEST })).toEqual(ctx.request);
		}
	);
});
