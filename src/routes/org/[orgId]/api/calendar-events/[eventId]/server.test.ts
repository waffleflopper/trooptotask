import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { CapabilityLevel, ScopeSet } from '$lib/access/memberAccessShape';
import {
	createTestAuditPort,
	createTestAuthContext,
	createTestScopeEnforcementPort
} from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarEventContext } from '$lib/server/adapters/requestContexts.server';
import { _deleteConfig } from './+server';

const ORG = '00000000-0000-4000-8000-000000000001';
const EVENT = '00000000-0000-4000-8000-000000000101';

function route(calendar: CapabilityLevel = 'operate', scopeSet: ScopeSet = { kind: 'organization' }, failure?: string) {
	let exists = true;
	const writes: unknown[] = [];
	const audit = createTestAuditPort();
	const supabase = createClient('http://event-delete.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.pathname === '/rest/v1/calendar_events' && request.method === 'GET') {
					if (url.searchParams.get('organization_id') !== `eq.${ORG}`) throw new Error('Wrong Organization');
					return Response.json(
						exists && url.searchParams.get('id') === `eq.${EVENT}`
							? [
									{
										id: EVENT,
										title: 'Best Medic Competition',
										starts_on: '2030-10-19',
										ends_on: '2030-10-23',
										host_name: null,
										coordinator_user_id: ORG,
										location: null,
										description: null,
										source_reference: null,
										cancelled_at: null,
										cancelled_by: null,
										cancellation_reason: null
									}
								]
							: []
					);
				}
				if (url.pathname === '/rest/v1/rpc/delete_calendar_event' && request.method === 'POST') {
					writes.push(await request.json());
					if (failure) return Response.json({ code: failure, message: 'RPC refused' }, { status: 400 });
					exists = false;
					return Response.json({ taskings: 2 });
				}
				throw new Error('Unexpected provider request');
			}
		}
	});
	const request = {
		auth: createTestAuthContext({
			orgId: ORG,
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: {
				calendar,
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet
		}),
		audit,
		supabase,
		session: null,
		scope: createTestScopeEnforcementPort(),
		disabledFeatures: []
	};
	const ctx = createRequestCalendarEventContext(request);
	return {
		writes,
		audit,
		exists: () => exists,
		invoke: (body: unknown, id = EVENT) => handleUseCaseRequest(_deleteConfig, request, { id, body }, () => ctx)
	};
}

describe('DELETE /org/[orgId]/api/calendar-events/[eventId]', () => {
	it.each(['standalone', 'delete'] as const)(
		'answers with the %s mode and affected count after deleting and auditing',
		async (taskings) => {
			const request = route();
			expect(await request.invoke({ taskings })).toEqual({ taskings, count: 2 });
			expect(request.exists()).toBe(false);
			expect(request.writes).toEqual([{ p_organization_id: ORG, p_event_id: EVENT, p_taskings: taskings }]);
			expect(request.audit.events).toEqual([
				{
					action: 'calendar_event.deleted',
					resourceType: 'calendar_event',
					resourceId: EVENT,
					details: { title: 'Best Medic Competition', mode: taskings, count: 2 }
				}
			]);
		}
	);

	it('refuses viewers and Group-scoped operators before a provider mutation', async () => {
		for (const request of [route('view'), route('operate', { kind: 'groups', groupIds: ['group-a'] })]) {
			await expect(request.invoke({ taskings: 'delete' })).rejects.toMatchObject({ status: 403 });
			expect(request.exists()).toBe(true);
			expect(request.writes).toEqual([]);
		}
	});

	it('returns 400 for invalid bodies and 404 with EVENT_GONE for a missing Event', async () => {
		const request = route();
		for (const body of [{}, { taskings: 'archive' }, { taskings: 'delete', actorId: ORG }]) {
			await expect(request.invoke(body)).rejects.toMatchObject({ status: 400 });
		}
		await expect(request.invoke({ taskings: 'standalone' }, ORG)).rejects.toMatchObject({
			status: 404,
			message: 'That event is no longer available.'
		});
		expect(request.exists()).toBe(true);
		expect(request.writes).toEqual([]);
	});

	it.each([
		['P0002', 404, 'That event is no longer available.'],
		['42501', 403, 'Events need Organization-wide Calendar operation access.'],
		['22023', 400, 'Choose whether to keep or delete the linked taskings.']
	])('maps an RPC %s failure without a success audit', async (code, status, message) => {
		const request = route('operate', { kind: 'organization' }, String(code));
		await expect(request.invoke({ taskings: 'delete' })).rejects.toMatchObject({ status, message });
		expect(request.exists()).toBe(true);
		expect(request.audit.events.filter(({ action }) => action === 'calendar_event.deleted')).toEqual([]);
	});
});
