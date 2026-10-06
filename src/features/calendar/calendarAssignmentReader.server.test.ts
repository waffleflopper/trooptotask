import { describe, expect, it } from 'vitest';
import { createSupabaseCalendarAssignmentReader } from './calendarAssignmentReader.server';
import { calendarProvider } from './test-support/calendarProvider';

const SAVED = {
	id: 'slot-a',
	organization_id: 'org-a',
	date: '2026-10-06',
	assignment_type_id: 'type-a',
	assignee_id: 'person-a',
	created_at: '2026-01-02T03:04:05.123456Z'
};
describe('Calendar ordinary assignment reads', () => {
	it('retains full range facts and exact day references without foreign rows', async () => {
		const { client } = calendarProvider({
			daily_assignments: [
				SAVED,
				{ ...SAVED, id: 'group', assignment_type_id: 'type-b', assignee_id: 'alpha' },
				{ ...SAVED, id: 'outside', date: '2026-10-07' },
				{ ...SAVED, id: 'foreign', organization_id: 'org-b' }
			]
		});
		const port = createSupabaseCalendarAssignmentReader(client, 'org-a');
		expect(await port.listRange({ rangeStart: '2026-10-06', rangeEnd: '2026-10-06' })).toEqual([
			{
				id: 'slot-a',
				organization_id: 'org-a',
				date: '2026-10-06',
				assignmentTypeId: 'type-a',
				assigneeId: 'person-a',
				created_at: '2026-01-02T03:04:05.123456Z'
			},
			{
				id: 'group',
				organization_id: 'org-a',
				date: '2026-10-06',
				assignmentTypeId: 'type-b',
				assigneeId: 'alpha',
				created_at: '2026-01-02T03:04:05.123456Z'
			}
		]);
		expect(await port.listDayReferences('2026-10-06')).toEqual([
			{ assignmentTypeId: 'type-a', assigneeId: 'person-a' },
			{ assignmentTypeId: 'type-b', assigneeId: 'alpha' }
		]);
		expect(await port.listDayReferences('2026-10-06', 'type-b')).toEqual([
			{ assignmentTypeId: 'type-b', assigneeId: 'alpha' }
		]);
	});

	it('admits only exact requested slot pairs and excludes Cartesian neighbors', async () => {
		const { client, state } = calendarProvider({
			daily_assignments: [
				SAVED,
				{ ...SAVED, id: 'diagonal', date: '2026-10-07', assignment_type_id: 'type-b', assignee_id: 'group-b' },
				{ ...SAVED, id: 'neighbor', date: '2026-10-06', assignment_type_id: 'type-b', assignee_id: 'protected' },
				{ ...SAVED, id: 'foreign', organization_id: 'org-b' }
			]
		});
		const port = createSupabaseCalendarAssignmentReader(client, 'org-a');
		expect(await port.listSlotReferences([])).toEqual([]);
		expect(state.requests).toEqual([]);
		expect(
			await port.listSlotReferences([
				{ date: '2026-10-06', assignmentTypeId: 'type-a' },
				{ date: '2026-10-07', assignmentTypeId: 'type-b' },
				{ date: '2026-10-06', assignmentTypeId: 'type-a' }
			])
		).toEqual([
			{ date: '2026-10-06', assignmentTypeId: 'type-a', assigneeId: 'person-a' },
			{ date: '2026-10-07', assignmentTypeId: 'type-b', assigneeId: 'group-b' }
		]);
	});

	it('completes range/day pages and rejects late failures without partial success', async () => {
		const { client, state } = calendarProvider({
			daily_assignments: Array.from({ length: 1001 }, (_, index) => ({
				...SAVED,
				id: `slot-${index}`,
				assignment_type_id: `type-${index}`
			}))
		});
		const port = createSupabaseCalendarAssignmentReader(client, 'org-a');
		expect((await port.listRange({ rangeStart: '2026-10-06', rangeEnd: '2026-10-06' })).at(-1)?.id).toBe('slot-1000');
		expect((await port.listDayReferences('2026-10-06')).at(-1)).toEqual({
			assignmentTypeId: 'type-1000',
			assigneeId: 'person-a'
		});
		for (const offset of [0, 1000]) {
			state.failure = (request) =>
				request.offset >= offset ? { code: '42501', message: 'Assignments unavailable', status: 403 } : null;
			await expect(port.listRange({ rangeStart: '2026-10-06', rangeEnd: '2026-10-06' })).rejects.toThrow(
				'Assignments unavailable'
			);
			await expect(port.listDayReferences('2026-10-06')).rejects.toThrow('Assignments unavailable');
		}
		state.failure = null;
		state.nullData = true;
		expect(await port.listRange({ rangeStart: '2026-10-06', rangeEnd: '2026-10-06' })).toEqual([]);
		expect(await port.listDayReferences('2026-10-06')).toEqual([]);
	});

	it('bounds all1000 requested pairs and rejects a later chunk error', async () => {
		const slots = Array.from({ length: 1000 }, (_, index) => ({
			date: '2026-10-06',
			assignmentTypeId: `00000000-0000-4000-a000-${String(index).padStart(12, '0')}`
		}));
		const { client, state } = calendarProvider({
			daily_assignments: slots.map((slot, index) => ({
				...SAVED,
				id: `slot-${index}`,
				assignment_type_id: slot.assignmentTypeId
			}))
		});
		const port = createSupabaseCalendarAssignmentReader(client, 'org-a');
		const result = await port.listSlotReferences(slots);
		expect(result).toHaveLength(1000);
		expect(result.at(-1)).toEqual({
			date: '2026-10-06',
			assignmentTypeId: slots[999].assignmentTypeId,
			assigneeId: 'person-a'
		});
		expect(Math.max(...state.requests.map(({ url }) => url.href.length))).toBeLessThan(6000);
		state.failure = (request) =>
			request.url.searchParams.get('assignment_type_id')?.includes(slots[100].assignmentTypeId)
				? { code: '42501', message: 'Later slots unavailable', status: 403 }
				: null;
		await expect(port.listSlotReferences(slots)).rejects.toThrow('Later slots unavailable');
	});
});
