import { describe, it, expect } from 'vitest';
import { createInMemoryDataStore, createTestAuthContext } from '$lib/server/adapters/inMemory';
import type { QueryPorts } from '$lib/server/core/ports';
import { findDutyCoverageConflicts } from './dutyAvailability';
import type { Personnel } from '$lib/types';

const ORG = 'test-org';

function buildCtx(): QueryPorts & { store: ReturnType<typeof createInMemoryDataStore> } {
	return {
		store: createInMemoryDataStore(),
		auth: createTestAuthContext({ orgId: ORG })
	};
}

const PERSON: Personnel = {
	id: 'p1',
	firstName: 'Alex',
	lastName: 'Smith',
	rank: 'SGT',
	groupId: 'g1',
	groupName: 'Alpha',
	clinicRole: '',
	mos: '11B'
};

const personnelById = new Map([['p1', PERSON]]);

function seedBlockingEvent(
	store: ReturnType<typeof createInMemoryDataStore>,
	overrides?: Partial<{ is_blocking: boolean; cooldown_hours: number }>
) {
	store.seed('duty_events', [
		{
			id: 'evt-1',
			organization_id: ORG,
			template_id: 'tpl-1',
			event_date: '2026-04-10',
			coverage_start: '2026-04-10T08:00:00',
			coverage_end: '2026-04-10T20:00:00',
			is_blocking: overrides?.is_blocking ?? true,
			cooldown_hours: overrides?.cooldown_hours ?? 12,
			coverage_mode: 'timed',
			template_name: 'CQ',
			rules_snapshot: {},
			fill_summary: {},
			collision_summary: {},
			original_proposal: null,
			created_at: '2026-04-01T00:00:00Z',
			updated_at: '2026-04-01T00:00:00Z'
		}
	]);
	store.seed('duty_event_slots', [
		{
			id: 'slot-1',
			organization_id: ORG,
			duty_event_id: 'evt-1',
			template_slot_id: 'tslot-1',
			role_label: 'NCO',
			slot_index: 0,
			assignee_id: 'p1',
			assignment_source: 'generated',
			warning_state: 'none',
			fairness_confidence: 'high',
			selection_reason: null,
			unfilled_reason: null,
			sort_order: 0
		}
	]);
}

describe('findDutyCoverageConflicts — blocking events', () => {
	it('returns an overlap conflict when an existing blocking event covers the same window', async () => {
		const ctx = buildCtx();
		seedBlockingEvent(ctx.store);

		const result = await findDutyCoverageConflicts(ctx, {
			assigneeIds: ['p1'],
			coverageStart: '2026-04-10T10:00:00',
			coverageEnd: '2026-04-10T18:00:00',
			cooldownHours: 0,
			personnelById
		});

		expect(result.get('p1')).toHaveLength(1);
		expect(result.get('p1')![0]).toContain('already assigned to duty coverage');
	});

	it('returns a prior-cooldown conflict when the new window falls inside the existing cooldown', async () => {
		const ctx = buildCtx();
		seedBlockingEvent(ctx.store, { cooldown_hours: 12 });

		// New event starts 4 hours after coverage end — still inside the 12-hour cooldown
		const result = await findDutyCoverageConflicts(ctx, {
			assigneeIds: ['p1'],
			coverageStart: '2026-04-11T00:00:00',
			coverageEnd: '2026-04-11T08:00:00',
			cooldownHours: 0,
			personnelById
		});

		expect(result.get('p1')).toHaveLength(1);
		expect(result.get('p1')![0]).toContain('still in cooldown');
	});

	it('returns empty when no overlap or cooldown conflict exists', async () => {
		const ctx = buildCtx();
		seedBlockingEvent(ctx.store, { cooldown_hours: 0 });

		// Starts after coverage ends with no cooldown
		const result = await findDutyCoverageConflicts(ctx, {
			assigneeIds: ['p1'],
			coverageStart: '2026-04-10T22:00:00',
			coverageEnd: '2026-04-11T06:00:00',
			cooldownHours: 0,
			personnelById
		});

		expect(result.size).toBe(0);
	});
});

describe('findDutyCoverageConflicts — non-blocking events', () => {
	it('does not flag an overlap conflict when the existing event is non-blocking', async () => {
		const ctx = buildCtx();
		seedBlockingEvent(ctx.store, { is_blocking: false });

		const result = await findDutyCoverageConflicts(ctx, {
			assigneeIds: ['p1'],
			coverageStart: '2026-04-10T10:00:00',
			coverageEnd: '2026-04-10T18:00:00',
			cooldownHours: 0,
			personnelById
		});

		expect(result.size).toBe(0);
	});

	it('does not flag a cooldown conflict when the existing event is non-blocking', async () => {
		const ctx = buildCtx();
		seedBlockingEvent(ctx.store, { is_blocking: false, cooldown_hours: 12 });

		// Would be inside cooldown if the event were blocking
		const result = await findDutyCoverageConflicts(ctx, {
			assigneeIds: ['p1'],
			coverageStart: '2026-04-11T00:00:00',
			coverageEnd: '2026-04-11T08:00:00',
			cooldownHours: 0,
			personnelById
		});

		expect(result.size).toBe(0);
	});
});

describe('findDutyCoverageConflicts — transient coverage', () => {
	it('flags an overlap from a blocking transient event', async () => {
		const ctx = buildCtx();

		const result = await findDutyCoverageConflicts(ctx, {
			assigneeIds: ['p1'],
			coverageStart: '2026-04-10T10:00:00',
			coverageEnd: '2026-04-10T18:00:00',
			cooldownHours: 0,
			personnelById,
			transientCoverage: [
				{
					assigneeId: 'p1',
					coverageStart: '2026-04-10T08:00:00',
					coverageEnd: '2026-04-10T20:00:00',
					cooldownHours: 0,
					isBlocking: true
				}
			]
		});

		expect(result.get('p1')).toHaveLength(1);
		expect(result.get('p1')![0]).toContain('already assigned to duty coverage');
	});

	it('does not flag an overlap from a non-blocking transient event', async () => {
		const ctx = buildCtx();

		const result = await findDutyCoverageConflicts(ctx, {
			assigneeIds: ['p1'],
			coverageStart: '2026-04-10T10:00:00',
			coverageEnd: '2026-04-10T18:00:00',
			cooldownHours: 0,
			personnelById,
			transientCoverage: [
				{
					assigneeId: 'p1',
					coverageStart: '2026-04-10T08:00:00',
					coverageEnd: '2026-04-10T20:00:00',
					cooldownHours: 0,
					isBlocking: false
				}
			]
		});

		expect(result.size).toBe(0);
	});

	it('treats transient coverage with no isBlocking field as blocking', async () => {
		const ctx = buildCtx();

		const result = await findDutyCoverageConflicts(ctx, {
			assigneeIds: ['p1'],
			coverageStart: '2026-04-10T10:00:00',
			coverageEnd: '2026-04-10T18:00:00',
			cooldownHours: 0,
			personnelById,
			transientCoverage: [
				{
					assigneeId: 'p1',
					coverageStart: '2026-04-10T08:00:00',
					coverageEnd: '2026-04-10T20:00:00',
					cooldownHours: 0
					// isBlocking omitted — should default to blocking
				}
			]
		});

		expect(result.get('p1')).toHaveLength(1);
	});

	it('flags blocking but skips non-blocking in a mixed transient list', async () => {
		const ctx = buildCtx();

		const result = await findDutyCoverageConflicts(ctx, {
			assigneeIds: ['p1'],
			coverageStart: '2026-04-10T10:00:00',
			coverageEnd: '2026-04-10T18:00:00',
			cooldownHours: 0,
			personnelById,
			transientCoverage: [
				{
					assigneeId: 'p1',
					coverageStart: '2026-04-10T08:00:00',
					coverageEnd: '2026-04-10T20:00:00',
					cooldownHours: 0,
					isBlocking: false
				},
				{
					assigneeId: 'p1',
					coverageStart: '2026-04-10T09:00:00',
					coverageEnd: '2026-04-10T21:00:00',
					cooldownHours: 0,
					isBlocking: true
				}
			]
		});

		// Only the blocking one should produce a conflict
		expect(result.get('p1')).toHaveLength(1);
	});
});
