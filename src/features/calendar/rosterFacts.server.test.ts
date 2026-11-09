import { describe, expect, it } from 'vitest';
import type { StatusType } from './contracts';
import { readRosterPeople, type RosterFactsPorts } from './rosterFacts.server';

const status = (id: string, name: string, rosterEffect: StatusType['rosterEffect'], archivedAt: string | null) =>
	({
		id,
		name,
		rosterEffect,
		archivedAt,
		color: '#22c55e',
		textColor: '#ffffff',
		shortLabel: null,
		sortOrder: 0
	}) as StatusType;

function ports(statusTypes: StatusType[]) {
	return {
		auth: {},
		personnelCalendarRoster: { listAttributeTimelines: async () => [] },
		loadRankCatalog: async () => [],
		calendarCatalogs: { listStatusTypes: async () => statusTypes },
		groups: { listCatalog: async () => [] }
	} as unknown as RosterFactsPorts;
}

describe('readRosterPeople', () => {
	it('leaves archived statuses out of the facts, so an entry that names one stops counting on an open form', async () => {
		const facts = await readRosterPeople(
			ports([
				status('leave', 'Leave', 'A', null),
				status('sick', 'Sick', 'U', '2030-01-02T03:04:05Z'),
				status('school', 'School', 'available', null)
			]),
			{ from: '2030-01-01', through: '2030-01-31' }
		);

		expect(facts.statusTypes).toEqual([
			{ id: 'leave', name: 'Leave', rosterEffect: 'A' },
			{ id: 'school', name: 'School', rosterEffect: 'available' }
		]);
	});
});
