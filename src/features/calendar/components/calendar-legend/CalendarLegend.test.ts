// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import type { AssignmentType } from '$features/calendar/contracts';
import FixtureLegendMark from '$features/calendar/test-support/FixtureLegendMark.svelte';
import { dutyMarkerLegend, legendMark, statusLegend, type LegendSource } from '$features/calendar/utils/calendarLegend';
import CalendarLegend from './CalendarLegend.svelte';

afterEach(cleanup);

const leave = { id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', shortLabel: null, sortOrder: 0 };

const dutyType: AssignmentType = {
	id: 'sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#2563eb',
	exemptPersonnelIds: [],
	showOnCalendar: false,
	sortOrder: 0
};

const training: LegendSource = {
	key: 'training',
	label: 'Training',
	hint: 'Click a course to open it',
	entries: [{ key: 'range', label: 'Range day', mark: legendMark(FixtureLegendMark, 'RNG') }]
};

function entryTexts(list: HTMLElement): string[] {
	return within(list)
		.getAllByRole('listitem')
		.map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

describe('CalendarLegend', () => {
	it('renders a new source beside the existing ones, with its mark and its hint', () => {
		render(CalendarLegend, { props: { sources: [statusLegend([leave]), training] } });
		const legend = within(screen.getByRole('group', { name: 'Calendar legend' }));

		expect(entryTexts(legend.getByRole('list', { name: 'Training' }))).toEqual(['RNG Range day']);
		expect(entryTexts(legend.getByRole('list', { name: 'Statuses' }))).toEqual(['LEA Leave']);
		expect(legend.getByText('Click a course to open it')).toBeTruthy();
	});

	it('shows the first duty code beside the duty entry', () => {
		render(CalendarLegend, { props: { sources: [dutyMarkerLegend([dutyType])] } });

		expect(entryTexts(screen.getByRole('list', { name: 'Duty markers' }))).toEqual(['SD Duty (SD)']);
	});

	it('leaves out a source with nothing to explain, and its hint', () => {
		render(CalendarLegend, { props: { sources: [statusLegend([leave]), { ...training, entries: [] }] } });
		const legend = within(screen.getByRole('group', { name: 'Calendar legend' }));

		expect(legend.queryByRole('list', { name: 'Training' })).toBeNull();
		expect(legend.queryByText('Click a course to open it')).toBeNull();
	});

	it('renders nothing when no source has entries', () => {
		render(CalendarLegend, { props: { sources: [statusLegend([]), { ...training, entries: [] }] } });

		expect(screen.queryByRole('group', { name: 'Calendar legend' })).toBeNull();
	});
});
