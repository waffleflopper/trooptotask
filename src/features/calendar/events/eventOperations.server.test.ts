import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '$lib/audit/contracts';
import type { CapabilityLevel, ScopeSet } from '$lib/access/memberAccessShape';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import type { CalendarEvent } from './eventModel';
import { cancelEvent, createEvent, listEvents, updateEvent, type CalendarEventPorts } from './eventOperations.server';
import type { CalendarEventPersistence } from './eventPersistence.server';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const EVENT = '00000000-0000-4000-8000-000000000101';
const draft = {
	title: 'Best Medic Competition',
	startsOn: '2026-10-19',
	endsOn: '2026-10-23',
	host: { kind: 'external', name: '1-1 BN' },
	coordinatorUserId: ACTOR,
	location: null,
	description: null,
	sourceReference: 'BN FRAGO 27-012'
};

function memoryEvents(): CalendarEventPersistence & { stored: Map<string, CalendarEvent> } {
	const stored = new Map<string, CalendarEvent>();
	return {
		stored,
		listEvents: async () => [...stored.values()],
		findEvent: async (id) => stored.get(id) ?? null,
		listActivity: async () => [],
		async createEvent(id, input) {
			const existing = stored.get(id);
			if (existing) return { event: existing, created: false };
			const event = { id, ...input, cancellation: null };
			stored.set(id, event);
			return { event, created: true };
		},
		async updateEvent(id, input) {
			const existing = stored.get(id);
			if (!existing) return null;
			const event = { ...existing, ...input };
			stored.set(id, event);
			return event;
		},
		async cancelEvent(id, reason) {
			const event = { ...stored.get(id)!, cancellation: { at: '2026-10-25T12:00:00Z', by: ACTOR, reason } };
			stored.set(id, event);
			return event;
		}
	};
}

/** The audit write lands a tick after it is called, so only an awaited write is visible when the operation returns. */
function slowAudit() {
	const entries: AuditEvent[] = [];
	return {
		entries,
		log: (entry: AuditEvent) =>
			new Promise<void>((resolve) =>
				setTimeout(() => {
					entries.push(entry);
					resolve();
				}, 0)
			)
	};
}

function member(calendar: CapabilityLevel, scopeSet: ScopeSet = { kind: 'organization' }) {
	const calendarEvents = memoryEvents();
	const audit = slowAudit();
	const ctx: CalendarEventPorts = {
		auth: createTestAuthContext({
			userId: ACTOR,
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: {
				calendar,
				personnel: 'view',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet
		}),
		audit,
		calendarEvents,
		memberLabels: async () => ({ [ACTOR]: 'sgt.kim@example.mil' })
	};
	return { ctx, calendarEvents, audit };
}

describe('Event operations', () => {
	it('lets an Organization-wide operator create, edit and cancel, auditing each before it answers', async () => {
		const { ctx, calendarEvents, audit } = member('operate');

		await createEvent(ctx, { id: EVENT, draft });
		expect(audit.entries.map((entry) => entry.action)).toEqual(['calendar_event.created']);

		await updateEvent(ctx, EVENT, { ...draft, startsOn: '2026-10-20' });
		await cancelEvent(ctx, EVENT, { reason: '  Range closed ' });

		expect(calendarEvents.stored.get(EVENT)).toMatchObject({
			startsOn: '2026-10-20',
			host: { kind: 'external', name: '1-1 BN' },
			cancellation: { by: ACTOR, reason: 'Range closed' }
		});
		expect(audit.entries.map((entry) => [entry.action, entry.resourceId])).toEqual([
			['calendar_event.created', EVENT],
			['calendar_event.updated', EVENT],
			['calendar_event.cancelled', EVENT]
		]);
	});

	it('answers a repeated create with the first event and audits it once', async () => {
		const { ctx, calendarEvents, audit } = member('operate');

		const first = await createEvent(ctx, { id: EVENT, draft });
		const retry = await createEvent(ctx, { id: EVENT, draft: { ...draft, title: 'Retyped' } });

		expect(retry).toEqual(first);
		expect(calendarEvents.stored.size).toBe(1);
		expect(audit.entries).toHaveLength(1);
	});

	it.each([
		['a Group-scoped operator', member('configure', { kind: 'groups', groupIds: ['g-1'] })],
		['an Organization-wide viewer', member('view')]
	])('refuses writes from %s and stores nothing', async (_who, { ctx, calendarEvents, audit }) => {
		await expect(createEvent(ctx, { id: EVENT, draft })).rejects.toMatchObject({ status: 403 });
		expect(calendarEvents.stored.size).toBe(0);
		expect(audit.entries.filter((entry) => entry.action.startsWith('calendar_event.'))).toEqual([]);
	});

	it('lets Group-scoped and view-only members read every event, and keeps out members without Calendar access', async () => {
		const scoped = member('view', { kind: 'groups', groupIds: ['g-1'] });
		scoped.calendarEvents.stored.set(EVENT, {
			id: EVENT,
			...draft,
			host: { kind: 'organization' },
			cancellation: null
		});

		const list = await listEvents(scoped.ctx, 'upcoming', '2026-10-01');
		expect(list.events.map((event) => event.id)).toEqual([EVENT]);
		expect(list.members).toEqual({ [ACTOR]: 'sgt.kim@example.mil' });

		await expect(listEvents(member('none').ctx, 'upcoming', '2026-10-01')).rejects.toMatchObject({ status: 403 });
	});

	it('refuses an edit that ends before it starts and keeps the saved dates', async () => {
		const { ctx, calendarEvents } = member('operate');
		await createEvent(ctx, { id: EVENT, draft });

		await expect(updateEvent(ctx, EVENT, { ...draft, endsOn: '2026-10-18' })).rejects.toMatchObject({ status: 400 });
		expect(calendarEvents.stored.get(EVENT)).toMatchObject({ startsOn: '2026-10-19', endsOn: '2026-10-23' });
	});
});
