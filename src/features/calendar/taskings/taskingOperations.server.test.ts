import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '$lib/audit/contracts';
import type { CapabilityLevel, ScopeSet } from '$lib/access/memberAccessShape';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { TASKING_TRANSITIONS, type Tasking, type TaskingDraft, type TaskingStatus } from './taskingModel';
import {
	createTasking,
	listTaskings,
	transitionTasking,
	updateTasking,
	type CalendarTaskingPorts
} from './taskingOperations.server';
import type { CalendarTaskingPersistence } from './taskingPersistence.server';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const TASKING = '00000000-0000-4000-8000-000000000101';
const ALPHA = '00000000-0000-4000-8000-000000000201';
const BRAVO = '00000000-0000-4000-8000-000000000202';
const draft = {
	title: 'Provide four trauma-lane medics',
	eventId: null,
	responsibility: { kind: 'group', groupId: ALPHA },
	suspenseOn: '2026-10-23',
	execution: { startsOn: '2026-10-19', endsOn: '2026-10-23', reportTime: '05:30' },
	requirement: { count: 4, qualifications: '68W' },
	instructions: null
};

function fromDraft(id: string, input: TaskingDraft): Tasking {
	const { title, responsibility, suspenseOn, execution, requirement, instructions } = input;
	return {
		id,
		title,
		event: null,
		responsibility,
		suspenseOn,
		execution,
		requirement,
		instructions,
		status: { kind: 'open' }
	};
}

function memoryTaskings(): CalendarTaskingPersistence & { stored: Map<string, Tasking> } {
	const stored = new Map<string, Tasking>();
	return {
		stored,
		listTaskings: async () => [...stored.values()],
		listEventTaskings: async () => [],
		findTasking: async (id) => stored.get(id) ?? null,
		listActivity: async () => [],
		findEventTitles: async () => ({}),
		async createTasking(id, input) {
			const existing = stored.get(id);
			if (existing) return { tasking: existing, created: false };
			const tasking = fromDraft(id, input);
			stored.set(id, tasking);
			return { tasking, created: true };
		},
		async updateTasking(id, input) {
			const existing = stored.get(id);
			if (!existing) return null;
			const tasking = { ...fromDraft(id, input), event: existing.event, status: existing.status };
			stored.set(id, tasking);
			return tasking;
		},
		async transitionTasking(id, transition) {
			const existing = stored.get(id)!;
			const { from, to } = TASKING_TRANSITIONS[transition.action];
			if (existing.status.kind === to) return existing;
			if (!from.includes(existing.status.kind)) throw new Error('not allowed');
			const at = '2026-10-25T12:00:00Z';
			const status: TaskingStatus =
				to === 'blocked'
					? { kind: to, reason: 'reason' in transition ? (transition.reason ?? '') : '', at, by: ACTOR }
					: to === 'completed'
						? { kind: to, note: null, at, by: ACTOR }
						: to === 'cancelled'
							? { kind: to, reason: null, at, by: ACTOR }
							: { kind: to };
			const tasking = { ...existing, status };
			stored.set(id, tasking);
			return tasking;
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
	const calendarTaskings = memoryTaskings();
	const audit = slowAudit();
	const ctx: CalendarTaskingPorts = {
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
		calendarTaskings,
		calendarEvents: { listEvents: async () => [] },
		groups: {
			listCatalog: async () =>
				scopeSet.kind === 'organization'
					? [
							{ id: ALPHA, name: 'Alpha', sortOrder: 0 },
							{ id: BRAVO, name: 'Bravo', sortOrder: 1 }
						]
					: [{ id: ALPHA, name: 'Alpha', sortOrder: 0 }]
		},
		memberLabels: async () => ({ [ACTOR]: 'sgt.kim@example.mil' })
	};
	return { ctx, calendarTaskings, audit };
}

const alphaOperator = () => member('operate', { kind: 'groups', groupIds: [ALPHA] });

describe('Tasking operations', () => {
	it('lets an Organization-wide operator create at Organization level and reroute to a Group', async () => {
		const { ctx, calendarTaskings, audit } = member('operate');

		await createTasking(ctx, { id: TASKING, draft: { ...draft, responsibility: { kind: 'organization' } } });
		await updateTasking(ctx, TASKING, { ...draft, responsibility: { kind: 'group', groupId: BRAVO } });

		expect(calendarTaskings.stored.get(TASKING)?.responsibility).toEqual({ kind: 'group', groupId: BRAVO });
		expect(audit.entries.map((entry) => entry.action)).toEqual([
			'calendar_tasking.created',
			'calendar_tasking.updated'
		]);
	});

	it('answers a repeated create with the first Tasking and audits it once', async () => {
		const { ctx, calendarTaskings, audit } = member('operate');

		const first = await createTasking(ctx, { id: TASKING, draft });
		const retry = await createTasking(ctx, { id: TASKING, draft: { ...draft, title: 'Retyped' } });

		expect(retry).toEqual(first);
		expect(calendarTaskings.stored.size).toBe(1);
		expect(audit.entries).toHaveLength(1);
	});

	it('lets a Group-scoped operator create and edit only their Group’s Taskings', async () => {
		const { ctx, calendarTaskings } = alphaOperator();

		await createTasking(ctx, { id: TASKING, draft });
		await updateTasking(ctx, TASKING, {
			...draft,
			suspenseOn: '2026-10-21',
			requirement: { count: 5, qualifications: null }
		});

		expect(calendarTaskings.stored.get(TASKING)).toMatchObject({
			suspenseOn: '2026-10-21',
			requirement: { count: 5, qualifications: null }
		});
	});

	it.each([
		['another Group', { kind: 'group', groupId: BRAVO }],
		['the Organization', { kind: 'organization' }]
	])('refuses a Group-scoped operator creating for %s', async (_whom, responsibility) => {
		const { ctx, calendarTaskings, audit } = alphaOperator();

		await expect(createTasking(ctx, { id: TASKING, draft: { ...draft, responsibility } })).rejects.toMatchObject({
			status: 403
		});
		expect(calendarTaskings.stored.size).toBe(0);
		expect(audit.entries.filter((entry) => entry.action.startsWith('calendar_tasking.'))).toEqual([]);
	});

	it.each([
		['to another Group', { kind: 'group', groupId: BRAVO }],
		['to the Organization', { kind: 'organization' }]
	])(
		'refuses a Group-scoped operator moving responsibility %s and keeps the Tasking',
		async (_whom, responsibility) => {
			const { ctx, calendarTaskings } = alphaOperator();
			await createTasking(ctx, { id: TASKING, draft });

			await expect(updateTasking(ctx, TASKING, { ...draft, responsibility })).rejects.toMatchObject({ status: 403 });
			expect(calendarTaskings.stored.get(TASKING)?.responsibility).toEqual({ kind: 'group', groupId: ALPHA });
		}
	);

	it('refuses a Group-scoped operator touching another Group’s Tasking', async () => {
		const { ctx, calendarTaskings } = alphaOperator();
		const bravo = { ...draft, responsibility: { kind: 'group', groupId: BRAVO } } as const;
		calendarTaskings.stored.set(TASKING, fromDraft(TASKING, bravo));

		await expect(updateTasking(ctx, TASKING, bravo)).rejects.toMatchObject({ status: 403 });
		await expect(transitionTasking(ctx, TASKING, { action: 'start' })).rejects.toMatchObject({ status: 403 });
		expect(calendarTaskings.stored.get(TASKING)?.status).toEqual({ kind: 'open' });
	});

	it('refuses a block without a reason before anything is stored', async () => {
		const { ctx, calendarTaskings } = member('operate');
		await createTasking(ctx, { id: TASKING, draft });

		await expect(transitionTasking(ctx, TASKING, { action: 'block', reason: '   ' })).rejects.toMatchObject({
			status: 400
		});
		expect(calendarTaskings.stored.get(TASKING)?.status).toEqual({ kind: 'open' });
	});

	it('audits a status change once even when the request is repeated', async () => {
		const { ctx, audit } = alphaOperator();
		await createTasking(ctx, { id: TASKING, draft });

		await transitionTasking(ctx, TASKING, { action: 'start' });
		await transitionTasking(ctx, TASKING, { action: 'start' });
		await transitionTasking(ctx, TASKING, { action: 'complete', note: null });

		expect(audit.entries.map((entry) => entry.action)).toEqual([
			'calendar_tasking.created',
			'calendar_tasking.started',
			'calendar_tasking.completed'
		]);
	});

	it('keeps viewers to reads and members without Calendar access out', async () => {
		const viewer = member('view');
		await expect(createTasking(viewer.ctx, { id: TASKING, draft })).rejects.toMatchObject({ status: 403 });
		expect((await listTaskings(viewer.ctx, 'active')).groups).toEqual({ [ALPHA]: 'Alpha', [BRAVO]: 'Bravo' });

		await expect(listTaskings(member('none').ctx, 'active')).rejects.toMatchObject({ status: 403 });
	});
});
