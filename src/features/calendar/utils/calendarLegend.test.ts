import { describe, expect, it } from 'vitest';
import type { AssignmentType } from '$features/calendar/contracts';
import { dutyMarkerLegend, statusLegend } from './calendarLegend';

function dutyType(overrides: Partial<AssignmentType>): AssignmentType {
	return {
		id: 'type',
		name: 'Duty',
		shortName: 'DT',
		assignTo: 'personnel',
		color: '#2563eb',
		exemptPersonnelIds: [],
		showOnCalendar: false,
		sortOrder: 0,
		...overrides
	};
}

describe('statusLegend', () => {
	it('keeps the stored status order and offers its hint', () => {
		const source = statusLegend(
			[
				{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#fff', shortLabel: null, sortOrder: 0 },
				{ id: 'tdy', name: 'TDY', color: '#2563eb', textColor: '#fff', shortLabel: 'T', sortOrder: 1 }
			],
			'Drag across days to add'
		);

		expect(source.entries.map((entry) => entry.label)).toEqual(['Leave', 'TDY']);
		expect(source.entries.map((entry) => entry.mark.value)).toMatchObject([{ text: 'LEA' }, { text: 'T' }]);
		expect(source.hint).toBe('Drag across days to add');
	});
});

describe('dutyMarkerLegend', () => {
	it('names every active personnel duty in one entry, in sort order', () => {
		const source = dutyMarkerLegend([
			dutyType({ id: 'cq', shortName: 'CQ', sortOrder: 2, color: '#dc2626' }),
			dutyType({ id: 'sd', shortName: 'SD', sortOrder: 1, color: '#2563eb' }),
			dutyType({ id: 'old', shortName: 'OLD', sortOrder: 0, archivedAt: '2026-01-01' }),
			dutyType({ id: 'det', shortName: 'DET', sortOrder: 0, assignTo: 'group' })
		]);

		expect(source.entries.map((entry) => entry.label)).toEqual(['Duty (SD, CQ)']);
		expect(source.entries[0].mark.value).toEqual({ code: 'SD', color: '#2563eb' });
	});

	it('has no entry when no duty draws a row marker', () => {
		expect(dutyMarkerLegend([dutyType({ assignTo: 'group' })]).entries).toEqual([]);
	});
});
