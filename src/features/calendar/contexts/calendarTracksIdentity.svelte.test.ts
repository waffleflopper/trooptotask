// @vitest-environment happy-dom
import { flushSync } from 'svelte';
import { afterEach, expect, it } from 'vitest';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import type { AvailabilityTracks } from '$features/calendar/utils/availabilityTracks';
import { CalendarPageContext } from './CalendarPageContext.svelte';

const personnel: Personnel[] = [
	{
		id: 'p1',
		firstName: 'Alice',
		lastName: 'Smith',
		rank: 'SGT',
		groupId: 'g1',
		groupName: 'Alpha',
		clinicRole: '',
		mos: '11B'
	},
	{
		id: 'p2',
		firstName: 'Bob',
		lastName: 'Jones',
		rank: 'SSG',
		groupId: 'g2',
		groupName: 'Bravo',
		clinicRole: '',
		mos: '68W'
	}
];
const leave: StatusType = {
	id: 'leave',
	name: 'Leave',
	color: '#16a34a',
	textColor: '#ffffff',
	shortLabel: null,
	sortOrder: 0
};
const entry = (id: string, startDate: string): AvailabilityEntry => ({
	id,
	personnelId: 'p1',
	statusTypeId: 'leave',
	startDate,
	endDate: startDate,
	note: null
});

afterEach(() => {
	availabilityStore.load([], '');
	statusTypesStore.load([], '');
});

it('publishes the availability tracks once through search, group filter and onboarding changes, and again for new entries', () => {
	statusTypesStore.load([leave], 'org1');
	availabilityStore.load([entry('a', '2026-04-07')], 'org1');
	const ctx = new CalendarPageContext(
		{ orgId: 'org1', personnel, allPersonnel: personnel },
		{
			userId: 'u1',
			...createClientAccess({ membershipRole: 'admin', capabilityMap: createCapabilityMap('configure') })
		},
		() => {}
	);
	const rendered: AvailabilityTracks[] = [];
	const unmount = $effect.root(() => {
		$effect(() => {
			rendered.push(ctx.availabilityTracks);
		});
	});
	flushSync();

	ctx.setCalendarPersonnelSearch('jones');
	flushSync();
	expect(ctx.filteredPBG.map((group) => group.group)).toEqual(['Bravo']);
	ctx.setCalendarGroupFilter('Alpha');
	flushSync();
	expect(ctx.filteredPBG).toEqual([]);
	ctx.toggleHighlightOnboarding();
	flushSync();
	expect(ctx.highlightOnboarding).toBe(false);
	expect(rendered).toHaveLength(1);

	availabilityStore.load([entry('a', '2026-04-07'), entry('b', '2026-04-09')], 'org1');
	flushSync();
	expect(
		rendered
			.at(-1)
			?.spans('p1')
			.map((span) => span.entry.id)
	).toEqual(['a', 'b']);
	unmount();
});
