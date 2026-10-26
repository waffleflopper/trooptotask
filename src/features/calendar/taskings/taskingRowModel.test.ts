import { describe, expect, it } from 'vitest';
import type { TaskingSummary } from './eventWorkModel';
import { activeTaskingCounts, filterTaskings, DEFAULT_TASKING_FILTERS, type Tasking } from './taskingModel';
import {
	equipmentFact,
	eventRelation,
	eventRowFacts,
	nextDateFacts,
	peopleFact,
	rollupEventTaskings,
	rollupFact,
	summarizeEventWork
} from './taskingRowModel';

const TODAY = '2026-10-16';
const AT = '2026-10-10T10:00:00Z';
const BMC = {
	id: 'bmc',
	title: 'Best Medic Competition',
	startsOn: '2026-10-19',
	endsOn: '2026-10-23',
	cancelled: false
};

function tasking(id: string, overrides: Partial<Tasking> = {}): Tasking {
	return {
		id,
		title: id,
		event: null,
		responsibility: { kind: 'organization' },
		suspenseOn: '2026-10-20',
		execution: null,
		requirement: null,
		instructions: null,
		status: { kind: 'open' },
		readiness: { equipment: null, checklist: null },
		...overrides
	};
}

const people = (count: number) => ({ count, qualifications: null });
const picked = (count: number) => ({ picked: count, needsReview: 0, outsideScope: 0 });

describe('Tasking row facts', () => {
	it('reads people against the requirement', () => {
		expect(peopleFact(people(3), 2)).toEqual({ text: '2 / 3', tone: 'warning' });
		expect(peopleFact(people(2), 2)).toEqual({ text: '2 / 2', tone: 'success' });
		expect(peopleFact(null, 0)).toEqual({ text: '—', tone: 'muted' });
		expect(peopleFact(null, 2)).toEqual({ text: '2', tone: 'plain' });
	});

	it('reads equipment as ready only when every item is secured', () => {
		expect(equipmentFact({ total: 2, ready: 2, partial: 0 })).toEqual({ text: 'Ready', tone: 'success' });
		expect(equipmentFact({ total: 4, ready: 3, partial: 1 })).toEqual({ text: '3 of 4 ready', tone: 'danger' });
		expect(equipmentFact(null)).toEqual({ text: '—', tone: 'muted' });
	});

	it('names the Event and whether the Tasking prepares for it or closes it out', () => {
		expect(eventRelation(tasking('roster', { event: BMC, suspenseOn: '2026-10-15' }))).toBe(
			'Best Medic Competition · prep'
		);
		expect(eventRelation(tasking('medics', { event: BMC, suspenseOn: '2026-10-23' }))).toBe('Best Medic Competition');
		expect(eventRelation(tasking('bags', { event: BMC, suspenseOn: '2026-10-26' }))).toBe(
			'Best Medic Competition · closeout'
		);
		expect(eventRelation(tasking('slides'))).toBe('Standalone · no event');
	});

	it('says what comes next and when the Tasking is due', () => {
		const lanes = { startsOn: '2026-10-19', endsOn: '2026-10-23', reportTime: '06:00' };
		expect(nextDateFacts(tasking('late', { suspenseOn: '2026-10-15' }), TODAY)).toEqual({
			primary: { text: 'Overdue 1 day', tone: 'danger' },
			due: 'Due Thu 15 Oct'
		});
		expect(nextDateFacts(tasking('soon', { suspenseOn: '2026-10-18' }), TODAY)).toEqual({
			primary: { text: 'In 2 days', tone: 'plain' },
			due: 'Due Sun 18 Oct'
		});
		expect(nextDateFacts(tasking('medics', { suspenseOn: '2026-10-23', execution: lanes }), TODAY)).toEqual({
			primary: { text: 'Starts Mon 19 Oct', tone: 'plain' },
			due: 'Due Fri 23 Oct'
		});
		expect(
			nextDateFacts(tasking('medics', { suspenseOn: '2026-10-23', execution: lanes }), TODAY, { report: true }).primary
		).toEqual({ text: 'Report 0600 Mon', tone: 'plain' });
		expect(nextDateFacts(tasking('today', { suspenseOn: TODAY }), TODAY).primary).toEqual({
			text: 'Due today',
			tone: 'warning'
		});
		expect(
			nextDateFacts(
				tasking('done', { suspenseOn: '2026-10-15', status: { kind: 'completed', note: null, at: AT, by: null } }),
				TODAY
			)
		).toEqual({ primary: { text: 'Completed', tone: 'muted' }, due: 'Due Thu 15 Oct' });
		expect(nextDateFacts(tasking('next year', { suspenseOn: '2027-01-04' }), TODAY).due).toBe('Due Mon 4 Jan 2027');
	});
});

describe('Taskings list counts and the Needs people view', () => {
	const list = [
		tasking('roster', { suspenseOn: '2026-10-15', requirement: people(3) }),
		tasking('lane', { status: { kind: 'blocked', reason: 'Aid bags', at: AT, by: null } }),
		tasking('medics', { requirement: people(2) }),
		tasking('graders', { requirement: people(3) })
	];
	const staffing = { roster: picked(2), medics: picked(2) };

	it('counts the active list once for every chip', () => {
		expect(activeTaskingCounts(list, staffing, TODAY)).toEqual({ active: 4, overdue: 1, blocked: 1, needsPeople: 2 });
	});

	it('shows only the active Taskings still short of people', () => {
		const shown = filterTaskings(list, { ...DEFAULT_TASKING_FILTERS, view: 'needs_people' }, TODAY, staffing);
		expect(shown.map((row) => row.id)).toEqual(['roster', 'graders']);
	});
});

describe('Event work', () => {
	const medics = tasking('medics', {
		event: BMC,
		suspenseOn: '2026-10-23',
		requirement: people(4),
		readiness: { equipment: { total: 1, ready: 1, partial: 0 }, checklist: null }
	});
	const evac = tasking('evac', {
		event: BMC,
		suspenseOn: '2026-10-23',
		requirement: people(2),
		readiness: { equipment: { total: 1, ready: 1, partial: 0 }, checklist: null }
	});
	const lane = tasking('lane', {
		event: BMC,
		suspenseOn: '2026-10-18',
		status: { kind: 'blocked', reason: 'Aid bags', at: AT, by: null },
		readiness: { equipment: { total: 2, ready: 1, partial: 1 }, checklist: null }
	});
	const roster = tasking('roster', { event: BMC, suspenseOn: '2026-10-15', requirement: people(3) });
	const otherGroup: TaskingSummary = {
		id: 'bravo',
		title: 'Bravo litter team',
		responsibility: { kind: 'group', name: 'Bravo' },
		status: 'open',
		requiredCount: 2,
		pickedCount: 1,
		suspenseOn: '2026-10-23',
		execution: null
	};
	const staffing = { medics: picked(3), evac: picked(2), roster: picked(2) };

	it('writes the staffing and equipment line in the colour of what is left', () => {
		expect(eventRowFacts({ kind: 'full', tasking: medics }, staffing)).toEqual({
			text: '3 of 4 picked · equipment ready',
			tone: 'warning'
		});
		expect(eventRowFacts({ kind: 'full', tasking: evac }, staffing)).toEqual({
			text: '2 of 2 picked · equipment ready',
			tone: 'success'
		});
		expect(eventRowFacts({ kind: 'full', tasking: lane }, staffing)).toEqual({
			text: 'equipment 1 of 2 ready',
			tone: 'danger'
		});
		expect(eventRowFacts({ kind: 'summary', summary: otherGroup }, staffing)).toEqual({
			text: '1 of 2 picked',
			tone: 'warning'
		});
		expect(eventRowFacts({ kind: 'full', tasking: tasking('slides') }, staffing)).toBeNull();
	});

	it('sums what the Organization owes the Event', () => {
		const items = [medics, evac, lane, roster].map((row) => ({ kind: 'full' as const, tasking: row }));
		expect(summarizeEventWork([...items, { kind: 'summary', summary: otherGroup }], staffing, TODAY)).toEqual({
			total: 5,
			overdue: 1,
			blocked: 1,
			needPeople: 3,
			ready: 1
		});
	});

	it('rolls active Taskings up per Event for the Events list', () => {
		const rollups = rollupEventTaskings(
			{
				scope: 'active',
				taskings: [medics, evac, lane, roster, tasking('slides')],
				groups: {},
				staffing
			},
			TODAY
		);
		expect(rollups).toEqual({ bmc: { total: 4, needAction: 3 } });
		expect(rollupFact(rollups.bmc)).toEqual({ text: '4 · 3 need action', tone: 'danger' });
		expect(rollupFact({ total: 2, needAction: 0 })).toEqual({ text: '2 · on track', tone: 'plain' });
		expect(rollupFact(undefined)).toEqual({ text: 'Awareness only', tone: 'muted' });
		expect(rollupFact(undefined, 'past')).toEqual({ text: 'No open taskings', tone: 'muted' });
	});
});
