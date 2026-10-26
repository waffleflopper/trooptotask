import { describe, expect, it } from 'vitest';
import type { TaskingRowFacts } from '../taskings/taskingReadModel';
import { EMPTY_PROJECTION, EMPTY_TASKING_FACTS, type CalendarProjection } from './calendarProjection';
import { projectionCard } from './projectionCardModel';
import type { ProjectionLinks } from './projectionLanes';

const links: ProjectionLinks = {
	events: '/events',
	event: (id) => `/events/${id}`,
	tasking: (id) => `/taskings/${id}`
};

const row = (overrides: Partial<TaskingRowFacts> = {}): TaskingRowFacts => ({
	eventRelation: 'execution',
	picked: 1,
	required: 2,
	equipment: { ready: 0, total: 0, returnedQuantity: 0, totalQuantity: 0 },
	conflicts: 1,
	nextDate: '2026-05-06',
	suspenseOn: '2026-05-10',
	status: 'open',
	responsibleGroupId: 'alpha',
	...overrides
});

const projection: CalendarProjection = {
	...EMPTY_PROJECTION,
	events: [
		{
			id: 'e1',
			title: 'Field exercise',
			startsOn: '2026-05-04',
			endsOn: '2026-05-06',
			cancelled: false,
			hasWork: true,
			host: '1st MDB'
		}
	],
	commitments: [
		{
			taskingId: 't1',
			title: 'Litter team',
			personnelId: 'p1',
			startsOn: '2026-05-04',
			endsOn: '2026-05-06',
			conflicts: true
		},
		{
			taskingId: 't1',
			title: 'Litter team',
			personnelId: 'p2',
			startsOn: '2026-05-04',
			endsOn: '2026-05-06',
			conflicts: false
		}
	]
};

const facts = (status: TaskingRowFacts['status'] = 'open') => ({
	...EMPTY_TASKING_FACTS,
	taskings: { t1: row({ status }) }
});

describe('projectionCard', () => {
	it('describes an Event with its host and a way to add a Tasking', () => {
		expect(projectionCard({ kind: 'event', id: 'e1' }, projection, EMPTY_TASKING_FACTS, links)).toMatchObject({
			kind: 'event',
			host: '1st MDB',
			taskings: null,
			href: '/events/e1',
			addTaskingHref: '/events/e1?addTasking'
		});
	});

	it.each([
		['open' as const, 'start'],
		['in_progress' as const, 'complete'],
		['blocked' as const, 'unblock']
	])('offers the step that carries a %s Tasking forward', (status, next) => {
		expect(projectionCard({ kind: 'tasking', id: 't1' }, projection, facts(status), links)).toMatchObject({ next });
	});

	it('names the row Person only when their own commitment clashes', () => {
		const from = (personnelId: string) =>
			projectionCard({ kind: 'tasking', id: 't1', personnelId }, projection, facts(), links);

		expect(from('p1')).toMatchObject({
			conflictingPersonId: 'p1',
			responsibility: { kind: 'group', groupId: 'alpha' }
		});
		expect(from('p2')).toMatchObject({ conflictingPersonId: null, conflicts: 1 });
	});

	it('has no card once the Tasking is done or the Event is gone', () => {
		expect(projectionCard({ kind: 'tasking', id: 't1' }, projection, facts('completed'), links)).toBeNull();
		expect(projectionCard({ kind: 'event', id: 'gone' }, projection, EMPTY_TASKING_FACTS, links)).toBeNull();
	});
});
