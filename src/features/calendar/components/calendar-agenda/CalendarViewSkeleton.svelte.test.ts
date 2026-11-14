// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { CalendarViewMode } from '$features/calendar/utils/calendarRange';
import CalendarViewSkeleton from './CalendarViewSkeleton.svelte';

const shapes = {
	agenda: 'calendar-agenda-skeleton',
	week: 'calendar-week-skeleton',
	'3-month': 'calendar-long-range-skeleton',
	month: 'skeleton-grid-cell'
} as const;

function shown(view: CalendarViewMode | null): string[] {
	const { container } = render(CalendarViewSkeleton, { props: { view } });
	return Object.values(shapes).filter((testId) => container.querySelector(`[data-testid="${testId}"]`));
}

describe('CalendarViewSkeleton', () => {
	afterEach(cleanup);

	it.each(Object.entries(shapes))('draws only the %s shape when that view is known', (view, testId) => {
		expect(shown(view as CalendarViewMode)).toEqual([testId]);
	});

	it('draws the Agenda and Month shapes for CSS to choose between while no view is saved', () => {
		expect(shown(null)).toEqual([shapes.agenda, shapes.month]);
	});
});
