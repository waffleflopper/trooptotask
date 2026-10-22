import { describe, expect, it } from 'vitest';
import { createCalendarWorkspaceHydrator } from '$features/calendar/calendarWorkspaceHydration.svelte';
import { calendarStatusHydration, type CalendarWorkspaceResult } from '$features/calendar';
import {
	groupCatalogHydration,
	personnelRosterHydration,
	personnelWorkspaceHydrator,
	pinnedGroupsHydration,
	pinnedGroupsStore
} from '$features/personnel';
import type { Personnel } from '$features/personnel/contracts';
import { trainingWorkspaceHydrator } from '$features/training';
import { criticalTasksWorkspaceHydrator } from '$features/critical-tasks';

const OCTOBER = { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' };

function preserveClientHydration(
	overrides: Partial<CalendarWorkspaceResult['hydration']>
): CalendarWorkspaceResult['hydration'] {
	return {
		orgId: 'org-1',
		confirmedChangesByTab: {},
		personnel: { mode: 'preserve-client', snapshotKey: 'personnel', items: [] },
		groups: { mode: 'preserve-client', snapshotKey: 'groups', items: [] },
		statusTypes: { mode: 'preserve-client', snapshotKey: 'status', items: [] },
		availabilityEntries: { mode: 'preserve-client', snapshotKey: 'availability', items: [], range: OCTOBER },
		specialDays: { mode: 'preserve-client', snapshotKey: 'special', items: [], range: OCTOBER },
		calendarAssignments: {
			mode: 'preserve-client',
			snapshotKey: 'assignments',
			items: { types: [], assignments: [] },
			range: OCTOBER
		},
		pinnedGroups: { mode: 'preserve-client', snapshotKey: 'pins', items: [] },
		...overrides
	};
}

describe('Shared workspace lane navigation', () => {
	it.each(['Training', 'Critical Tasks', 'Personnel'] as const)(
		'restores the admitted Calendar roster after visiting denied %s and returning with the same snapshot',
		async (deniedLane) => {
			const calendar = createCalendarWorkspaceHydrator();
			const hydration = preserveClientHydration({
				personnel: { mode: 'replace', snapshotKey: 'allowed-roster', items: [{ id: 'p1' } as Personnel] },
				groups: {
					mode: 'replace',
					snapshotKey: 'allowed-groups',
					items: [{ id: 'alpha', name: 'Alpha', sortOrder: 0 }]
				},
				pinnedGroups: { mode: 'replace', snapshotKey: 'allowed-pins', items: ['Alpha'] }
			});
			await calendar.hydrate(hydration);
			expect(personnelRosterHydration.items.map((person) => person.id)).toEqual(['p1']);

			if (deniedLane === 'Training') trainingWorkspaceHydrator.restrict();
			else if (deniedLane === 'Critical Tasks') criticalTasksWorkspaceHydrator.restrict();
			else
				personnelWorkspaceHydrator.restrict({
					personnelStore: personnelRosterHydration,
					groupsStore: groupCatalogHydration,
					pinnedGroupsStore: pinnedGroupsHydration,
					statusTypesStore: calendarStatusHydration
				});

			await calendar.hydrate(hydration);
			expect(personnelRosterHydration.items.map((person) => person.id)).toEqual(['p1']);
			expect(groupCatalogHydration.items.map((group) => group.name)).toEqual(['Alpha']);
			expect(pinnedGroupsStore.list).toEqual(['Alpha']);
		}
	);
});
