import { describe, expect, it } from 'vitest';
import { buildGroupTree } from '$features/personnel/contracts';
import type { TaskingSummary } from './eventWorkModel';
import { filterTaskings, DEFAULT_TASKING_FILTERS, type Tasking } from './taskingModel';
import type { EventTaskingSummary, TaskingRowFacts } from './taskingReadModel';
import {
	equipmentFact,
	eventRelation,
	eventRowFacts,
	eventSummaryLine,
	nextDateFacts,
	peopleFact,
	rollupFact
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

function facts(overrides: Partial<TaskingRowFacts> = {}): TaskingRowFacts {
	return {
		eventRelation: 'execution',
		picked: 0,
		required: null,
		equipment: { ready: 0, total: 0, returnedQuantity: 0, totalQuantity: 0 },
		conflicts: 0,
		nextDate: '2026-10-20',
		suspenseOn: '2026-10-20',
		status: 'open',
		responsibleGroupId: null,
		...overrides
	};
}

const equipment = (ready: number, total: number, returnedQuantity = 0, totalQuantity = total) => ({
	ready,
	total,
	returnedQuantity,
	totalQuantity
});

describe('Tasking row facts', () => {
	it('reads people against the requirement', () => {
		expect(peopleFact({ picked: 2, required: 3 }).tone).toBe('warning');
		expect(peopleFact({ picked: 2, required: 2 }).tone).toBe('success');
		expect(peopleFact({ picked: 0, required: null }).tone).toBe('muted');
		expect(peopleFact({ picked: 2, required: null }).tone).toBe('plain');
	});

	it('reads equipment as ready only when every item is secured, and closeout work by what came back', () => {
		expect(equipmentFact(facts({ equipment: equipment(2, 2) })).tone).toBe('success');
		expect(equipmentFact(facts({ equipment: equipment(3, 4) })).tone).toBe('danger');
		expect(equipmentFact(facts()).tone).toBe('muted');
		const back = (returned: number) =>
			equipmentFact(facts({ eventRelation: 'closeout', equipment: equipment(2, 2, returned, 4) }));
		expect(back(4).tone).toBe('success');
		expect(back(2).tone).toBe('plain');
		expect(back(2).text).toMatch(/2\D+4/);
	});

	it('names the Event and whether the Tasking prepares for it or closes it out', () => {
		expect(eventRelation(BMC, 'preparation')).not.toBe(eventRelation(BMC, 'execution'));
		expect(eventRelation(BMC, 'closeout')).not.toBe(eventRelation(BMC, 'execution'));
		expect(eventRelation(BMC, 'execution')).toBe(BMC.title);
		expect(eventRelation(null, 'standalone')).not.toContain(BMC.title);
	});

	it('says what comes next and when the Tasking is due', () => {
		const lanes = { startsOn: '2026-10-19', endsOn: '2026-10-23', reportTime: '06:00' };
		expect(nextDateFacts(tasking('late', { suspenseOn: '2026-10-15' }), TODAY).primary.tone).toBe('danger');
		expect(nextDateFacts(tasking('soon', { suspenseOn: '2026-10-18' }), TODAY).primary.tone).toBe('plain');
		expect(nextDateFacts(tasking('today', { suspenseOn: TODAY }), TODAY).primary.tone).toBe('warning');
		expect(
			nextDateFacts(tasking('medics', { suspenseOn: '2026-10-23', execution: lanes }), TODAY, { report: true }).primary
				.text
		).toMatch(/0600/);
		expect(
			nextDateFacts(
				tasking('done', { suspenseOn: '2026-10-15', status: { kind: 'completed', note: null, at: AT, by: null } }),
				TODAY
			).primary.tone
		).toBe('muted');
		expect(nextDateFacts(tasking('next year', { suspenseOn: '2027-01-04' }), TODAY).due).toMatch(/2027/);
	});
});

describe('The Needs people view', () => {
	it('shows only the active Taskings still short of people', () => {
		const list = [tasking('roster'), tasking('lane'), tasking('medics'), tasking('graders'), tasking('unknown')];
		const rowFacts = {
			roster: facts({ picked: 2, required: 3 }),
			lane: facts({ picked: 0, required: 2, status: 'blocked' }),
			medics: facts({ picked: 2, required: 2 }),
			graders: facts({ picked: 1, required: 3, status: 'completed' })
		};
		const shown = filterTaskings(
			list,
			{ ...DEFAULT_TASKING_FILTERS, view: 'needs_people' },
			TODAY,
			buildGroupTree([]),
			rowFacts
		);
		expect(shown.map((row) => row.id).sort()).toEqual(['lane', 'roster']);
	});
});

describe('Event work', () => {
	const full = (row: TaskingRowFacts) => eventRowFacts({ kind: 'full', tasking: tasking('row') }, row);
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
	const summary = (overrides: Partial<EventTaskingSummary> = {}): EventTaskingSummary => ({
		total: 0,
		needAction: 0,
		overdue: 0,
		blocked: 0,
		needPeople: 0,
		fullyStaffedAndReady: 0,
		conflicts: 0,
		...overrides
	});

	it('colours each row by what is left: missing equipment, then missing people, then done', () => {
		expect(full(facts({ picked: 3, required: 4, equipment: equipment(1, 1) }))?.tone).toBe('warning');
		expect(full(facts({ picked: 2, required: 2, equipment: equipment(1, 1) }))?.tone).toBe('success');
		expect(full(facts({ picked: 2, required: 2, equipment: equipment(1, 2) }))?.tone).toBe('danger');
		expect(eventRowFacts({ kind: 'summary', summary: otherGroup }, undefined)?.tone).toBe('warning');
		expect(full(facts())).toBeNull();
		expect(eventRowFacts({ kind: 'full', tasking: tasking('row') }, undefined)).toBeNull();
	});

	it('reads closeout equipment by what came back, never as missing', () => {
		const closeout = full(facts({ eventRelation: 'closeout', equipment: equipment(0, 2, 1, 4) }));
		expect(closeout?.tone).not.toBe('danger');
		expect(closeout?.text).toMatch(/1\D+4/);
	});

	it('lists only what is non-zero, with conflicts amber and never red', () => {
		const line = eventSummaryLine(summary({ total: 5, overdue: 1, needPeople: 2, conflicts: 3 }));
		expect(line.map((part) => part.tone)).toEqual(['danger', 'warning', 'warning']);
		expect(line.find((part) => part.conflicts)?.conflicts).toBe(3);
		expect(eventSummaryLine(summary({ total: 2 }))).toEqual([]);
	});

	it('rolls an Event up for the Events list, with no Taskings meaning awareness only', () => {
		expect(rollupFact(summary({ total: 4, needAction: 3 })).tone).toBe('danger');
		expect(rollupFact(summary({ total: 2 })).tone).toBe('plain');
		expect(rollupFact(summary()).tone).toBe('muted');
		expect(rollupFact(undefined)).toEqual(rollupFact(summary()));
	});
});
